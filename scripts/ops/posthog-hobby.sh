#!/usr/bin/env bash
# Official PostHog hobby deploy wrapper for zerotrust operators.
#
# PostHog's self-hosted stack is large (~20 GB of images, 16+ GB RAM recommended)
# and is maintained upstream as its own compose project. This script runs the
# official deploy-hobby installer in an isolated directory under infra/posthog/.
#
# Usage:
#   ./scripts/ops/posthog-hobby.sh
#   ./scripts/ops/posthog-hobby.sh --domain analytics.localhost
#
# After deploy:
#   UI: http://localhost (or https://$DOMAIN when TLS is configured)
#   Set NEXT_PUBLIC_POSTHOG_KEY / POSTHOG_HOST in packages/ui/.env.local
#
# Docs: docs/infra/README.md § PostHog

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/infra/posthog"
DOMAIN="${POSTHOG_DOMAIN:-localhost}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${DEPLOY_DIR}"
cd "${DEPLOY_DIR}"

if [[ ! -f docker-compose.yml && ! -f docker-compose.hobby.yml ]]; then
  echo "Running official PostHog hobby deploy script (downloads compose + .env)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/posthog/posthog/HEAD/bin/deploy-hobby)" "${DOMAIN}"
else
  echo "PostHog compose already present in ${DEPLOY_DIR}; starting stack..."
  if [[ -f docker-compose.hobby.yml ]]; then
    docker compose -f docker-compose.hobby.yml up -d
  else
    docker compose up -d
  fi
fi

cat <<EOF

PostHog hobby deploy directory: ${DEPLOY_DIR}

Next steps for zerotrust:
  1. Open the PostHog UI and create a project + snippet API key.
  2. Set in packages/ui/.env.local:
       NEXT_PUBLIC_POSTHOG_KEY=<project-api-key>
       NEXT_PUBLIC_POSTHOG_HOST=http://localhost
  3. Load the snippet via packages/ui/src/components/AnalyticsScript.tsx (consent-gated).
  4. For server-side events, use the PostHog HTTP API — never put secrets in URLs.

See docs/infra/README.md for resource requirements and production guidance.
EOF
