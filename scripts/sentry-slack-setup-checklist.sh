#!/usr/bin/env bash
# Sentry project + Slack alert setup checklist (manual UI steps).
# Run: bash scripts/sentry-slack-setup-checklist.sh
set -euo pipefail

cat <<'EOF'
=== Sentry ↔ Slack setup checklist ===

1) Sentry projects (https://sentry.io)
   - Org: existing (o4511681297317888 / Flutter app already present)
   - Create project: dopa-api  (platform: NestJS / Node)
   - Create project: dopa-admin (platform: Next.js)
   - Keep existing Flutter project as dopa-app (or rename)

2) Copy DSNs
   - dopa-api   → spot-backend SENTRY_DSN
   - dopa-admin → spot-admin SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN
   - Then run: bash scripts/wire-sentry-secrets.sh <api-dsn> <admin-dsn>

3) Slack Integration
   - Sentry → Settings → Integrations → Slack → Install / Add Workspace
   - Invite @Sentry to #dopa-alerts (or per-service channels)

4) Alert Rules (each project: Alerts → Create Alert)
   - When: A new issue is created
   - Optional: issue changes from resolved → unresolved
   - Filter: environment is production
   - Action: Send a Slack notification → #dopa-alerts
   - Save and send a test notification

5) Optional
   - In Slack: /sentry link  (Resolve / Assign buttons)

EOF
