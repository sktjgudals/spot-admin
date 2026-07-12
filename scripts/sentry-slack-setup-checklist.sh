#!/usr/bin/env bash
# Sentry project + Slack alert setup checklist (manual UI steps).
# Run: bash scripts/sentry-slack-setup-checklist.sh
set -euo pipefail

cat <<'EOF'
=== Sentry ↔ Slack setup checklist ===

## 왜 Issues가 "Get Started"만 뜨나?

온보딩 = 해당 프로젝트로 이벤트가 한 번도 안 들어옴.
DSN project id 불일치(프로젝트 재생성 후 옛 DSN 유지)가 가장 흔함.
Slack [app] 알림은 Sentry 업로드와 별도 파이프라 Issues가 비어도 뜰 수 있음.

## 1) Sentry projects (https://sentry.io)

   - Org: dopa-q2 (기존 Flutter DSN org id o4511681297317888)
   - dopa-api   → spot-backend SENTRY_DSN
   - dopa-admin → spot-admin SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN
   - dopa-app   → Flutter --dart-define=SENTRY_DSN (TestFlight 빌드)

## 2) Copy DSNs → wire

   bash scripts/wire-sentry-secrets.sh '<dopa-api-dsn>' '<dopa-admin-dsn>'

   Admin: NEXT_PUBLIC_SENTRY_DSN 은 Docker **빌드 ARG**로도 넣어야
   클라이언트(브라우저) Issues가 쌓임. 런타임 Secret만으로는 서버만 활성.

## 3) Slack Integration

   - Sentry → Settings → Integrations → Slack
   - Alert: new issue (production) → Slack channel

## 4) Verify

   각 프로젝트 Issues에서 온보딩이 사라지고 실제 event가 보이는지 확인.

EOF
