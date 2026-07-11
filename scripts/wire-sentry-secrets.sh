#!/usr/bin/env bash
# Create/update GCP Secret Manager DSNs and attach them to Cloud Run services.
# Usage:
#   bash scripts/wire-sentry-secrets.sh '<dopa-api-dsn>' '<dopa-admin-dsn>'
set -euo pipefail

API_DSN="${1:-}"
ADMIN_DSN="${2:-}"
PROJECT_ID="${PROJECT_ID:-spot-4749d}"
REGION="${REGION:-asia-northeast3}"

if [[ -z "$API_DSN" || -z "$ADMIN_DSN" ]]; then
  echo "Usage: $0 '<dopa-api-dsn>' '<dopa-admin-dsn>'" >&2
  exit 1
fi

upsert_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project "$PROJECT_ID" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project "$PROJECT_ID" --replication-policy=automatic --data-file=-
  fi
}

echo "Upserting secrets..."
upsert_secret sentry-dsn-api "$API_DSN"
upsert_secret sentry-dsn-admin "$ADMIN_DSN"

# Grant Cloud Run runtime SAs access to the new secrets
API_SA="$(gcloud run services describe dopa-api --region "$REGION" --project "$PROJECT_ID" --format='value(spec.template.spec.serviceAccountName)')"
ADMIN_SA="$(gcloud run services describe dopa-admin --region "$REGION" --project "$PROJECT_ID" --format='value(spec.template.spec.serviceAccountName)')"
API_SA="${API_SA:-dopa-api@${PROJECT_ID}.iam.gserviceaccount.com}"
ADMIN_SA="${ADMIN_SA:-dopa-admin@${PROJECT_ID}.iam.gserviceaccount.com}"

for secret in sentry-dsn-api; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${API_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet || true
done

for secret in sentry-dsn-admin; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project "$PROJECT_ID" \
    --member="serviceAccount:${ADMIN_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet || true
done

echo "Updating Cloud Run env (dopa-api)..."
gcloud run services update dopa-api \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --update-secrets=SENTRY_DSN=sentry-dsn-api:latest

echo "Updating Cloud Run env (dopa-admin)..."
# NEXT_PUBLIC_SENTRY_DSN is also set at runtime for server components;
# client bundle needs rebuild with the same value as a build ARG for full client coverage.
gcloud run services update dopa-admin \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --update-secrets=SENTRY_DSN=sentry-dsn-admin:latest,NEXT_PUBLIC_SENTRY_DSN=sentry-dsn-admin:latest

echo "Done. Redeploy images if needed so new code picks up Sentry SDK."
