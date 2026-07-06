# Operational Reference Architecture (Deployment Blueprints)

Three production-grade deployment topologies for zerotrust, from a single VM to
Kubernetes. Each blueprint covers the runtime topology, scaling model, backup
strategy, migration ordering, and rollback procedure.

---

## Blueprint 1: Single VM (PM2 + nginx)

**Best for:** small teams, prototypes, staging environments, cost-sensitive deploys.

```
                    ┌───────────────────────────────────┐
                    │          nginx (TLS term)          │
                    │  api.you.com → :1337              │
                    │  you.com     → :3000              │
                    └─────┬──────────────┬──────────────┘
                          │              │
            ┌─────────────▼──┐  ┌────────▼──────────┐
            │  PM2: API x N  │  │  PM2: UI (fork)   │
            │  (cluster)     │  │  (port 3000)       │
            │  port 1337     │  │                    │
            └───────┬────────┘  └───────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   PostgreSQL   Redis     S3-compatible
   (managed)   (managed)  (backups/uploads)
```

### Runtime topology

| Component | Process                                                 | Replicas      | Notes                                                 |
| --------- | ------------------------------------------------------- | ------------- | ----------------------------------------------------- |
| API       | `WORKER_MODE=true pm2 start dist/api/server.js -i max`  | N (CPU count) | Cluster mode; schedulers/consumers deferred to worker |
| Worker    | `pm2 start dist/worker.js -i 1 --name zerotrust-worker` | 1             | Owns BullMQ consumers + scheduled jobs                |
| UI        | `pm2 start npm --name zerotrust-ui -- start`            | 1 (fork)      | Next.js production server                             |
| nginx     | systemd                                                 | 1             | TLS termination, static asset caching                 |

### Services

| Layer          | Provider options                                                          |
| -------------- | ------------------------------------------------------------------------- |
| PostgreSQL     | Neon, Supabase, AWS RDS, or self-hosted `apt install postgresql`          |
| Redis          | Upstash, Redis Cloud, AWS ElastiCache, or self-hosted `apt install redis` |
| Object storage | AWS S3, Backblaze B2, Cloudflare R2, MinIO (S3-compatible)                |

### Scaling model

- **API:** vertical (bigger VM) or limited horizontal (more PM2 workers). Beyond
  4-8 workers, postgres connection pooling becomes the bottleneck — move to
  Blueprint 2 or 3.
- **UI:** single process; Next.js ISR/revalidation handles cache freshness.
  Static assets (/\_next/static) served by nginx.
- **Workers:** production API replicas set `WORKER_MODE=true`; run exactly 1
  dedicated worker process via `pm2 start dist/worker.js -i 1`.

### Backup strategy

- Nightly `pg_dump` via `bun run db:backup` → local retention (7 days) + S3 (30
  days). Encrypted at rest via `BACKUP_ENCRYPTION_KEY_HEX`.
- Redis: managed provider handles RDB/AOF snapshots. Self-hosted: `SAVE` every
  15 minutes.
- DR drill: `dr-restore-drill.yml` (scheduled) or manual `bun run db:restore`.

### Migration ordering

1. `git pull` + `bun install`
2. Run migrations: `bun run db:migrate`
3. Build: `bun run build`
4. Restart: `pm2 restart zerotrust-api`
5. Wait for old tokens to expire (1h) if rotating `TOKEN_SECRET_HEX`
6. Build + restart UI: `cd packages/ui && bun install && bun run build && pm2 restart zerotrust-ui`

### Rollback procedure

1. `git checkout <previous-release-tag>`
2. `bun install && bun run build && pm2 restart zerotrust-api`
3. If schema was changed: restore DB from pre-migration backup (`bun run db:restore <backup-file>`)
4. Verify: `bun run ops:smoke`

### RTO / RPO

| Metric              | Target                                                |
| ------------------- | ----------------------------------------------------- |
| RTO (recovery time) | <30 min (app) / <2h (DB restore from S3)              |
| RPO (data loss)     | <1 hour (nightly backup + Redis pub/sub for sessions) |

---

## Blueprint 2: Container Platform (Docker Compose / Fly / Railway / Render)

**Best for:** teams wanting reproducible builds, zero-downtime deploys, managed
infra with minimal ops.

```
                         ┌─────────────────────┐
                         │    Load Balancer     │
                         │  (platform-provided) │
                         └────────┬────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼──────┐  ┌────────▼───────┐  ┌────────▼───────┐
    │  API container  │  │  UI container  │  │  Worker container│
    │  (Hono, :1337)  │  │  (Next, :3000) │  │  (BullMQ + cron) │
    │  replicas: 2-4  │  │  replicas: 1-2 │  │  replicas: 1     │
    └────────┬────────┘  └────────────────┘  └────────┬────────┘
             │                                        │
     ┌───────┼────────────────────────────────────────┼───────┐
     │       ▼                ▼                ▼              │
     │  PostgreSQL       Redis (managed)   S3-compatible      │
     │  (managed)        or Valkey         (object storage)   │
     └────────────────────────────────────────────────────────┘
```

### Dockerfile targets

```dockerfile
# Multi-stage Dockerfile (recommended)
FROM oven/bun:1 AS builder
# … build steps …

# API target
FROM oven/bun:1-slim AS api
COPY --from=builder /app/dist ./dist
CMD ["bun", "dist/api/server.js"]

# Worker target
FROM oven/bun:1-slim AS worker
COPY --from=builder /app/dist ./dist
CMD ["bun", "dist/worker.js"]

# UI target
FROM node:20-slim AS ui
COPY --from=builder /app/packages/ui/.next ./.next
CMD ["node", "node_modules/.bin/next", "start"]
```

### docker-compose.yml (local / staging)

```yaml
services:
  api:
    build: { target: api }
    ports: ["1337:1337"]
    env_file: .env
    environment:
      WORKER_MODE: "true"
    depends_on: [postgres, redis]
    deploy: { replicas: 2 }

  worker:
    build: { target: worker }
    env_file: .env
    depends_on: [postgres, redis]
    deploy: { replicas: 1 }

  ui:
    build: { target: ui }
    ports: ["3000:3000"]
    env_file: packages/ui/.env.local
    depends_on: [api]

  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

### Scaling model

- **API:** horizontal (add replicas). Stateless aside from token secret (must
  match across replicas).
- **Worker:** single replica (BullMQ delivers each scheduled/queued job to
  exactly one consumer, but keep replicas at 1 as a deliberate topology choice
  rather than relying on that as a substitute for intentional scaling).
- **UI:** 1-2 replicas for HA; Next.js ISR cache is per-instance.

### Deployment (rolling)

1. `docker compose build`
2. `docker compose up -d --scale api=4` (rolling — old containers drain, new
   ones start)
3. `bun run db:migrate` (run once from a build step or init container)
4. Health check: `curl -f http://localhost:1337/healthz`

### RTO / RPO

| Metric | Target                                               |
| ------ | ---------------------------------------------------- |
| RTO    | <5 min (container restart)                           |
| RPO    | Managed DB point-in-time recovery (<5 min typically) |

---

## Blueprint 3: Kubernetes (k8s / GKE / EKS / AKS)

**Best for:** teams with existing Kubernetes clusters, multi-region deploys,
advanced traffic management.

```
                         ┌──────────────────────┐
                         │   Ingress Controller  │
                         │  (nginx / Traefik)    │
                         │  TLS termination      │
                         └──────────┬───────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                    │
    ┌──────────▼─────────┐ ┌───────▼────────┐ ┌─────────▼──────────┐
    │  api Deployment     │ │ ui Deployment  │ │ worker Deployment   │
    │  replicas: 3-6     │ │ replicas: 2    │ │ replicas: 1         │
    │  HPA: 70% CPU      │ │                │ │ anti-affinity: hard │
    └──────────┬─────────┘ └────────────────┘ └─────────┬──────────┘
               │                                        │
    ┌──────────┼────────────────────────────────────────┼──────────┐
    │          ▼                ▼                ▼                 │
    │  Cloud SQL / RDS    Redis / Valkey    S3-compatible          │
    │  (managed PG)       (ElastiCache /    (object storage)       │
    │                      Memorystore)                            │
    └──────────────────────────────────────────────────────────────┘
```

### Kubernetes manifests

```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zerotrust-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: zerotrust-api
  template:
    metadata:
      labels:
        app: zerotrust-api
    spec:
      containers:
        - name: api
          image: registry.example.com/zerotrust-api:latest
          ports:
            - containerPort: 1337
          env:
            - name: WORKER_MODE
              value: "true"
          envFrom:
            - secretRef:
                name: zerotrust-env
          livenessProbe:
            httpGet: { path: /health, port: 1337 }
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet: { path: /healthz, port: 1337 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: "256Mi", cpu: "250m" }
            limits: { memory: "512Mi", cpu: "500m" }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: zerotrust-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: zerotrust-api
  minReplicas: 3
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
---
# worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zerotrust-worker
spec:
  replicas: 1 # single instance — BullMQ owns exactly-once job delivery
  selector:
    matchLabels:
      app: zerotrust-worker
  template:
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: zerotrust-worker
              topologyKey: kubernetes.io/hostname
      containers:
        - name: worker
          image: registry.example.com/zerotrust-api:latest
          command: ["bun", "dist/worker.js"]
          envFrom:
            - secretRef:
                name: zerotrust-env
```

### Migration strategy

Use a **Kubernetes Job** for migrations (runs once, before pod rollout):

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: zerotrust-migrate-{{ .Release.Revision }}
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: registry.example.com/zerotrust-api:latest
          command: ["bun", "run", "db:migrate"]
          envFrom:
            - secretRef:
                name: zerotrust-env
```

### TLS / cert-manager

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: zerotrust-tls
spec:
  secretName: zerotrust-tls-secret
  dnsNames:
    - api.example.com
    - example.com
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
```

### Prometheus ServiceMonitor (token-gated — production default-closed)

`/metrics` is **open by default** unless `METRICS_AUTH_TOKEN` is set. Production
deploys MUST set this env var (see deployment checklist). The scrape config below
sends the required bearer token via a Kubernetes secret.

```bash
# Create the metrics auth secret once per cluster
kubectl create secret generic zerotrust-metrics-auth \
  --from-literal=token="$(openssl rand -hex 32)"
```

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: zerotrust-api
spec:
  selector:
    matchLabels:
      app: zerotrust-api
  endpoints:
    - port: http
      path: /metrics
      bearerTokenSecret:
        name: zerotrust-metrics-auth
        key: token
```

For VM/PM2 deploys without a ServiceMonitor, set `METRICS_AUTH_TOKEN` in the
environment and configure `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: zerotrust-api
    static_configs:
      - targets: ["localhost:1337"]
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/zerotrust/metrics-token
```

### RTO / RPO

| Metric | Target                                                    |
| ------ | --------------------------------------------------------- |
| RTO    | <2 min (pod restart) / <5 min (node failure + reschedule) |
| RPO    | Managed DB point-in-time recovery (seconds to minutes)    |

---

## Service dependency diagram (all blueprints)

```
                    ┌──────────┐
                    │  Client  │
                    │ (browser)│
                    └────┬─────┘
                         │ HTTPS
              ┌──────────┼──────────┐
              ▼          ▼          │
        ┌──────────┐ ┌──────┐      │
        │ Next.js UI│ │  API │◄─────┘ (API for SDK consumers)
        │  :3000    │ │ :1337│
        └──────────┘ └──┬───┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐ ┌──────────┐ ┌──────────────┐
    │PostgreSQL│ │  Redis   │ │ S3-compatible │
    │  (R/W)   │ │ (cache,  │ │ (backups,     │
    │          │ │  queue)  │ │  uploads)     │
    └──────────┘ └──────────┘ └──────────────┘
          ▲
    ┌─────┴─────┐     ┌──────────┐
    │ Read      │     │  Worker  │ (optional)
    │ Replica   │     │ (BullMQ  │
    │ (optional)│     │  + cron) │
    └───────────┘     └──────────┘

External providers (optional):
  SMTP · Stripe · Elasticsearch · Sentry
  OAuth (Google/GitHub/Facebook) · SMTP · Stripe · Elasticsearch · Sentry
```

---

## Choosing a blueprint

| Factor          | Blueprint 1 (VM)                  | Blueprint 2 (Containers)     | Blueprint 3 (k8s)           |
| --------------- | --------------------------------- | ---------------------------- | --------------------------- |
| Setup time      | Hours                             | Hours–1 day                  | Days–weeks                  |
| Ops burden      | Medium (OS updates, PM2)          | Low (platform handles)       | High (cluster maintenance)  |
| Scaling ceiling | ~4-8 workers before DB pool limit | 10+ replicas (stateless)     | 50+ pods (cluster capacity) |
| Rollback speed  | Manual (git checkout + restart)   | Container tag swap           | Helm rollback / Argo CD     |
| Multi-region    | Manual DNS failover               | Platform-dependent           | Native (topology spread)    |
| Cost (min)      | $10–20/mo VM                      | $20–50/mo platform           | $50–100/mo cluster baseline |
| Best for        | Prototypes, small teams           | Growing teams, managed infra | Enterprise, multi-region    |

---

## Production security defaults (all blueprints)

These env vars and DB objects are **required or strongly recommended** for
production reference deployments (FS-1 / ZT-4, 2026-07-04).

### Secrets and config validation

- `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`, and `BACKUP_ENCRYPTION_KEY_HEX`
  must be 32-byte random hex — **not** all-zero or documented `.env.example`
  placeholders. `validateConfig()` refuses to boot in `NODE_ENV=production`
  when a known placeholder is detected (`src/shared/placeholderSecrets.ts`).
- `METRICS_AUTH_TOKEN`, `CORS_ALLOWED_ORIGINS`, and `REDIS_URI` are required
  in production (see deployment checklist in `docs/deployment-checklist.md`).

### Audit log immutability and anchoring

- Migration `0031_audit_logs_immutable.sql` installs `BEFORE UPDATE OR DELETE`
  triggers on `audit_logs` — rows are append-only at the database layer even if
  application code regresses.
- Enable external anchoring in production:

```env
AUDIT_ANCHOR_ENABLED=true
AUDIT_ANCHOR_ENVIRONMENT=production
AUDIT_ANCHOR_S3_PREFIX=audit-anchors/
```

- Schedule `bun run audit:anchor` (or the BullMQ `audit.anchor` job on the worker)
  at least daily; verify with `bun run audit:anchor-verify` after DR drills.
  See [`docs/compliance/README.md`](./compliance/README.md).

### Postgres dual roles (SEC-25)

- **`DATABASE_URL`** — runtime app user (`zerotrust_app_user`): DML only, no DDL,
  `row_security = on`, subject to `FORCE ROW LEVEL SECURITY` policies from drizzle
  migrations.
- **`DATABASE_MIGRATOR_URL`** — deploy/migrate user (`zerotrust_migrator_user`):
  DDL for `bun run db:migrate` only; never mount on API/worker pods.
- Bootstrap: `scripts/setup-postgres-roles.sql` (run once per database after initial
  schema). Full runbook: `docs/deployment.md` § Postgres roles.

### Browser token storage

- UI uses in-memory access tokens + httpOnly refresh cookies. Set
  `CORS_ALLOWED_ORIGINS` to the exact UI origin(s) so credentialed refresh works.
- Native clients (e.g. React Native) call the Hono API directly with bearer tokens
  in device secure storage — not through the Next.js app.

**Recommendation:** start with Blueprint 1 or 2 (managed DB + object storage),
defer k8s until you have a dedicated platform team. The codebase is designed for
this progression — no architecture change is needed to move from one blueprint
to the next.
