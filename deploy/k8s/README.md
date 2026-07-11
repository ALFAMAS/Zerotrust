# zerotrust Kubernetes deployment

Helm chart and Kustomize overlays derived from
[`docs/reference-architecture.md`](../../docs/reference-architecture.md) Blueprint 3.

## Prerequisites

- Kubernetes 1.28+
- Helm 3.12+
- Ingress controller (nginx or Traefik)
- cert-manager (optional, for TLS)
- Secrets created out-of-band (never commit real credentials):

```bash
kubectl create namespace zerotrust

# Runtime credentials (app user — DATABASE_URL, REDIS_URL, etc.)
kubectl -n zerotrust create secret generic zerotrust-env \
  --from-env-file=.env.production

# Migrator credentials (DDL user — DATABASE_MIGRATOR_URL only)
kubectl -n zerotrust create secret generic zerotrust-env-migrator \
  --from-literal=DATABASE_MIGRATOR_URL='postgres://migrator:...@host/db'
```

## Helm install

```bash
# Render locally (no cluster required)
helm template zerotrust deploy/k8s/helm/zerotrust \
  --set global.imageRegistry=ghcr.io/your-org

# Install to cluster
helm upgrade --install zerotrust deploy/k8s/helm/zerotrust \
  -n zerotrust \
  -f deploy/k8s/kustomize/production/values-helm.yaml
```

Ports match [`CLAUDE.md`](../../CLAUDE.md): API **1337**, UI **3000**.

## Kustomize overlays

Overlays wrap environment-specific Helm value files and optional raw patches:

```bash
# Staging
kubectl apply -k deploy/k8s/kustomize/staging

# Production
kubectl apply -k deploy/k8s/kustomize/production
```

Each overlay documents the expected `helm upgrade` command in its `kustomization.yaml`.
For GitOps (Argo CD / Flux), point the application at the overlay path and run Helm
via your controller's chart source.

## Migration job

The chart ships a one-shot `Job` (`migrate-job.yaml`) that runs `bun run db:migrate`
with `DATABASE_MIGRATOR_URL`. Run it **before** rolling out new API pods when schema
changes ship. See [`docs/deployment.md`](../../docs/deployment.md) § Postgres roles.

## Operator follow-ups

1. Push API/UI images to your registry and set `global.imageRegistry` + image tags.
2. Wire managed Postgres, Redis, and object storage (see `deploy/terraform/`).
3. Set `METRICS_AUTH_TOKEN` in `zerotrust-env` and configure Prometheus ServiceMonitor
   per reference-architecture § Prometheus ServiceMonitor.
