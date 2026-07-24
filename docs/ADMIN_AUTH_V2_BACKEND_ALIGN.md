# Admin Auth v2 — backend alignment note

**Date**: 2026-07-24  
**spot-admin branch**: `refactor/admin-auth-v2`  
**spot-backend branch**: `refactor/chat-v3`

## Already true on spot-admin (main)

- NextAuth removed; login uses Nest `POST /auth/v2/admin/login` (`useCookie: true`)
- `AdminAuthProvider` + single-flight refresh + `/auth/v2/admin/me`
- See `docs/AUTH_V2_AUTHSHELL.md`

## Backend change (this cycle)

| Before | After |
|--------|--------|
| `src/auth/admin/AdminAuthService` (local bcrypt) | Removed |
| Flutter `POST /auth/admin-login` | Alias → `AdminOperatorLoginService` (Auth v2 assert + consumer JWT) |
| Web login | Unchanged path; shares `assertAuthenticatedAdminAccount` |

Canonical operator path for future app builds:

```
POST /auth/v2/admin/operator-login
```

No deploy required for admin-web if already pointing at Nest Auth v2.
