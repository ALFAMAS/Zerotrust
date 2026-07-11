# Infisical vs HashiCorp Vault

Comparison of two popular secrets-management platforms for teams operating
zerotrust-style SaaS stacks: multi-service deploys, many env-scoped secrets,
CI/CD injection, and SOC 2–style audit expectations.

**Audience:** operators choosing a secrets backend for zerotrust production deploys.  
**Canonical env inventory:** root [`.env.example`](../../.env.example).

---

## Executive summary

| | **Infisical** | **HashiCorp Vault** |
| --- | --- | --- |
| **Best fit** | Small/medium teams wanting fast DX and a managed-feeling OSS workflow | Mature platforms needing policy-as-code, dynamic credentials, and PKI |
| **Open source** | Core platform OSS (MIT); cloud/enterprise features tiered | Core OSS (BSL → Apache after 4y); enterprise HSM, replication, namespaces |
| **Time to first secret** | Minutes (UI + CLI + SDK) | Hours–days (unseal, policies, auth methods) |
| **zerotrust recommendation** | **Default choice** for this template | Choose when compliance or dynamic DB creds justify the ops cost |

---

## 1. Use cases

### Infisical

- Centralize `.env`-style secrets for API, UI, worker, and compose overlays.
- Developer self-service: scoped project environments (`dev`, `staging`, `prod`).
- CI/CD secret injection (GitHub Actions, GitLab, etc.) without copying `.env` files.
- Optional **secret sync** to external stores and **dynamic secrets** on paid/enterprise tiers.
- Kubernetes operator and agent-based injection for container deploys.

### HashiCorp Vault

- Enterprise secrets management with **leases**, **revocation**, and **dynamic credentials**
  (short-lived DB/AWS/K8s creds generated on demand).
- **Encryption as a service** (Transit), **PKI** (internal TLS), **KV** static secrets.
- Multi-tenant **namespaces** and **replication** for regulated, multi-region fleets.
- Long-running standard for platform/SRE teams already on the HashiCorp stack.

### For zerotrust specifically

zerotrust carries high-impact static secrets:

| Secret | Why it matters |
| --- | --- |
| `TOKEN_SECRET_HEX` | Session/token signing — compromise = full auth bypass |
| `CSFLE_MASTER_KEY_HEX` | Field-level encryption — loss = permanent data loss |
| `DATABASE_URL` / migrator URL | Tenant data access |
| `REDIS_URI` | Sessions, rate limits, job queues |
| `METRICS_AUTH_TOKEN` | Prevents `/metrics` intelligence leak (OPS-1) |
| `STRIPE_*`, `OAUTH_*`, `MAIL_*` | Billing and identity provider credentials |
| `BACKUP_ENCRYPTION_KEY_HEX` | Backup confidentiality |
| `SENTRY_DSN` / GlitchTip DSN | Error telemetry routing |

Both tools can store these. Vault adds more value when you need **dynamic Postgres
roles** per deploy job or **Transit** for application-level crypto delegation—not
strictly required for a typical zerotrust VPS/compose deploy.

---

## 2. Deployment model

### Infisical

| Aspect | Details |
| --- | --- |
| **Topology** | Single Docker Compose stack or Infisical Cloud |
| **Components** | Backend API, Postgres, Redis, optional gateway/rendering services |
| **HA** | Enterprise / self-hosted HA patterns; hobby/single-node is common |
| **Upgrade** | Image tag bump + migration; relatively few moving parts |
| **Footprint** | Low–medium (suitable alongside zerotrust on one staging VM) |

Typical self-hosted layout mirrors other zerotrust overlays: one compose file,
persistent volumes, reverse proxy for HTTPS.

### HashiCorp Vault

| Aspect | Details |
| --- | --- |
| **Topology** | Single node (dev) or HA cluster (3+ nodes) with Consul/Raft storage |
| **Components** | Vault servers, storage backend, optional load balancer |
| **Bootstrap** | **Unseal** ceremony (Shamir keys or auto-unseal via KMS/HSM) |
| **HA** | Native replication; enterprise DR and performance replication |
| **Footprint** | Medium–high; HA cluster is a dedicated platform service |

Vault is an **infrastructure product you operate**, not a sidecar. Budget SRE time
for unseal runbooks, version upgrades, and storage backup/restore drills.

---

## 3. Secrets management features

| Feature | Infisical | Vault |
| --- | --- | --- |
| Static KV secrets | Yes (project/env scoped) | Yes (`kv` v2 with versioning) |
| Secret versioning | Yes | Yes (KV v2) |
| Rollback | Yes | Yes (KV v2 metadata) |
| Dynamic secrets | Enterprise / cloud features | Core strength (DB, AWS, GCP, K8s, …) |
| Encryption as a service | Limited / platform-dependent | Transit engine (first-class) |
| PKI / internal TLS | Not primary focus | PKI secrets engine |
| Secret rotation | Intervals + reminders; some auto-rotation | Rotation workflows + dynamic creds |
| Path / RBAC model | Project → environment → role | Path-based ACL policies (HCL) |
| CLI | `infisical` CLI | `vault` CLI |
| UI | Modern, developer-centric | Functional, operator-centric |

**zerotrust mapping:** treat each Infisical project environment or Vault KV path
as a 1:1 mirror of `.env.example` keys. Example Vault path:
`zerotrust/data/prod/api` with keys `TOKEN_SECRET_HEX`, `DATABASE_URL`, etc.

---

## 4. Auth and integrations

### Authentication

| Method | Infisical | Vault |
| --- | --- | --- |
| User login | Email/OAuth, org RBAC | Userpass, OIDC, LDAP, MFA (enterprise) |
| Machine / app auth | Service tokens, identities | AppRole, Kubernetes auth, JWT, cloud IAM |
| CI/CD | Native GitHub/GitLab integrations, OIDC | JWT/OIDC, AppRole, short-lived tokens |

### Kubernetes

| | Infisical | Vault |
| --- | --- | --- |
| Pattern | Infisical Operator / agent injects env or files | Vault Agent sidecar or CSI provider |
| zerotrust fit | Good for single-replica compose→k8s migrations | Good for multi-replica, namespace-isolated fleets |

### CI/CD (GitHub Actions example)

**Infisical:** workflow pulls secrets via OIDC or service token → exports as job env.  
**Vault:** JWT auth role bound to GitHub OIDC → read KV path → export env.

Both avoid committing `.env` to the repo. zerotrust already uses GitHub secrets
for staging validation (`METRICS_AUTH_TOKEN` in `staging-validation.yml`); either
tool formalizes that pattern across all keys.

### SDKs and runtime

| Runtime | Infisical | Vault |
| --- | --- | --- |
| Node/Bun (zerotrust API) | `@infisical/sdk` or env injection at process start | `node-vault` client or env injection via agent |
| Next.js UI | Build-time public vars still need CI injection; server secrets via env | Same pattern |
| Docker Compose | Entrypoint fetches secrets or use host env file from CLI | Vault Agent renders `env` file before `docker compose up` |

**Practical note:** zerotrust reads secrets from **environment variables** at boot
(`src/config/env.ts`). You do not need in-app SDK calls on day one—inject env from
Infisical/Vault at deploy time and keep the app unchanged.

---

## 5. Pricing and licensing

### Infisical

| Tier | Model |
| --- | --- |
| **Open source** | Self-host core platform (MIT) |
| **Infisical Cloud** | Per-seat / usage-based SaaS |
| **Enterprise** | SSO, SCIM, audit exports, advanced RBAC, SLA |

No license ambiguity for self-hosted MIT core. Paid tiers add governance features
SOC 2 auditors often ask for (SSO, access logs export).

### HashiCorp Vault

| Tier | Model |
| --- | --- |
| **Open source** | Free self-hosted (BSL license; converts to Apache after four years per version) |
| **Enterprise** | HA DR, namespaces, HSM auto-unseal, Sentinel policies, support |

License history matters for **long-term OSS strategy** teams; evaluate BSL terms
against your organization's open-source policy.

### Cost of ownership (not license fees)

| Cost driver | Infisical | Vault |
| --- | --- | --- |
| Engineer time to operate | Low | Medium–high |
| Extra infrastructure | 1 small VM often enough | 3+ nodes for HA |
| Training | Hours | Days–weeks for policy + unseal |

---

## 6. Security model, rotation, and audit

### Security model

| Control | Infisical | Vault |
| --- | --- | --- |
| Encryption at rest | Platform-dependent (self-host: DB + app-level) | Sealed storage; master key never leaves Vault |
| Encryption in transit | TLS required in production | TLS required |
| Least privilege | Project roles, environment isolation | Path policies; very granular but easy to misconfigure |
| Blast radius | Service tokens scoped to project/env | Tokens with explicit TTL and policies |
| Unseal / root risk | Standard DB/admin protection | Root token + unseal keys are critical assets |

### Rotation

| Secret type | Infisical | Vault |
| --- | --- | --- |
| Static API keys (`STRIPE_SECRET_KEY`) | Manual or scheduled reminder | KV versioning + external rotation hooks |
| `TOKEN_SECRET_HEX` | Manual rotation + rolling deploy | Same; Vault does not remove app coordination |
| Database passwords | Manual | **Dynamic DB creds** — Vault generates short-lived users |
| TLS certificates | External or sync | PKI engine issuance |

zerotrust's `CSFLE_MASTER_KEY_HEX` rotation requires an **application migration**
(re-encrypt columns)—neither tool automates that without custom workflows.

### Audit

| | Infisical | Vault |
| --- | --- | --- |
| Access logs | Yes (tier-dependent export) | **Audit devices** — file, syslog, socket (enterprise sinks) |
| Tamper evidence | Platform logs | Hash-chained audit log option |
| SOC 2 evidence | Cloud/enterprise assists | Mature auditor familiarity |

For zerotrust compliance packets under `docs/compliance/`, export monthly secret
access logs from whichever platform you choose and attach to access-review evidence.

---

## 7. When to choose each

### Choose **Infisical** when

- You want secrets out of `.env` files **this week** with minimal new infrastructure.
- The team is small; no dedicated platform SRE.
- Static env injection for API + worker + UI build pipeline is the main goal.
- You prefer a modern UI and CLI that mirrors developer `.env` mental models.
- Self-hosted MIT core meets your license requirements.

### Choose **HashiCorp Vault** when

- You need **dynamic database credentials** or cloud IAM brokering at scale.
- **Transit** or **PKI** are first-class requirements (not just KV storage).
- You already run Vault (or Consul) for other services.
- Regulated environments demand mature audit devices, namespaces, and HA DR.
- Policy-as-code (HCL) and fine-grained path ACLs are worth the learning curve.

### Hybrid (common at scale)

- **Infisical** (or cloud SM) for application config and third-party API keys.
- **Vault** for dynamic infra creds and PKI.

That split is optional; zerotrust does not require it at launch.

---

## 8. Recommendation for zerotrust

**Primary recommendation: Infisical (self-hosted)** for teams adopting this template.

Rationale:

1. **Env-shaped secrets** — zerotrust is configured entirely through environment
   variables documented in `.env.example`. Infisical's project/environment model
   maps cleanly without app code changes.
2. **Operational proportionality** — alongside Prometheus, GlitchTip, and compose
   deploys, Infisical's footprint matches a single-operator SaaS starter. Vault HA
   is disproportionate until you have multiple services needing dynamic creds.
3. **Time to value** — faster onboarding for contributors cloning the repo and
   deploying to staging/production.
4. **Security baseline alignment** — moving `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`,
   `METRICS_AUTH_TOKEN`, and Stripe/OAuth keys out of flat files directly supports
   SEC/OPS items in `docs/production-checklist.md`.

**Choose Vault instead** when:

- Production runs on Kubernetes with **per-pod dynamic DB credentials**.
- Compliance mandates Vault specifically, or you need **Transit** for key custody
  separation beyond zerotrust's built-in CSFLE.
- A platform team already operates Vault Enterprise with 24/7 on-call.

### Suggested rollout (either tool)

1. Inventory secrets from `.env.example` (P0: `TOKEN_SECRET_HEX`, `CSFLE_MASTER_KEY_HEX`,
   `DATABASE_URL`, `REDIS_URI`, `METRICS_AUTH_TOKEN`).
2. Create `dev`, `staging`, `prod` environments (Infisical) or KV paths (Vault).
3. Inject at deploy time — PM2, Docker Compose, Coolify, or GitHub Actions — never
   commit real values.
4. Rotate `METRICS_AUTH_TOKEN` and provider keys on a calendar; document in
   `docs/compliance/access-review-procedure.md`.
5. Export quarterly access logs for SOC 2 evidence.

---

## 9. Using Vault with zerotrust

This repo ships a **local dev-mode Vault** in `docker-compose.platform.yml` and
operator steps in [`docs/infra/README.md`](../infra/README.md) § HashiCorp Vault.

### Quick start

```bash
docker compose -f docker-compose.yml -f docker-compose.platform.yml up -d vault
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=dev-root-token   # or VAULT_DEV_ROOT_TOKEN from .env
vault secrets enable -path=zerotrust kv-v2
```

Default URL: **http://localhost:8200** (UI at `/ui`).

### Path layout

Mirror `.env.example` keys under KV v2:

| Vault path | Maps to |
| --- | --- |
| `zerotrust/dev/api` | Root `.env` (API + worker) |
| `zerotrust/dev/ui` | `packages/ui/.env.local` |
| `zerotrust/staging/api` | Staging deploy env |
| `zerotrust/prod/api` | Production API secrets |

Example:

```bash
vault kv put zerotrust/prod/api \
  TOKEN_SECRET_HEX=<64-hex> \
  CSFLE_MASTER_KEY_HEX=<64-hex> \
  DATABASE_URL=postgresql://... \
  METRICS_AUTH_TOKEN=<openssl rand -hex 32>
```

### How zerotrust consumes secrets

zerotrust loads config from **process environment** (`src/config/env.ts`). No
Vault SDK is required initially:

1. **Deploy-time injection** — CI or a shell wrapper reads KV and exports env vars
   before `bun dev`, PM2, or `docker compose up`.
2. **Vault Agent** — renders `.env` or a systemd `EnvironmentFile` from a template
   (recommended for production VMs).
3. **Kubernetes** — Vault Agent sidecar or CSI driver injects files/env into pods.

```bash
# One-shot local export
vault kv get -format=json zerotrust/dev/api \
  | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' > .env.vault
set -a && source .env.vault && set +a && bun dev
```

Optional client env vars (documented in `.env.example`): `VAULT_ADDR`, `VAULT_TOKEN`,
`VAULT_KV_MOUNT`, `VAULT_KV_PATH` — for deploy scripts, not the running API.

### Init / unseal (production)

The compose overlay uses **dev mode** (in-memory, auto-unsealed). Production Vault
requires:

- `vault operator init` → store Shamir unseal keys + root token offline
- `vault operator unseal` after every restart (unless KMS auto-unseal)
- TLS, audit devices, and AppRole/OIDC instead of long-lived root tokens

See [`docs/infra/README.md`](../infra/README.md) for the full production checklist.

### When Vault adds value beyond Infisical here

- Short-lived **Postgres credentials** via the database secrets engine
- **Transit** for encryption-as-a-service (key custody separate from app)
- **PKI** for internal mTLS between platform services
- Existing Vault Enterprise with namespaces, DR replication, and auditor familiarity

For most zerotrust VPS/compose deploys, Infisical remains the lower-ops default
(§ 8). Use Vault when one of the bullets above is a hard requirement.

---

## 10. References

- Infisical docs: https://infisical.com/docs
- HashiCorp Vault docs: https://developer.hashicorp.com/vault/docs
- zerotrust env inventory: [`.env.example`](../../.env.example)
- Platform stack operator guide: [`docs/infra/README.md`](../infra/README.md) (§ HashiCorp Vault)
- OSS tooling shortlist: [`oss.md`](../../oss.md)
