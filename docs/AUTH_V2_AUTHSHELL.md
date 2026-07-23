# Auth v2 Admin Web (spot-admin)

NextAuth **removed** (PR3). Nest Auth v2 only.

## Structure

```
src/auth/
  api/   admin-auth, business, invite, party, mail-outbox, admin-http
  model/ types, routes (scope contract)
  store/ accessToken memory
  refresh/ single-flight
  provider/ AdminAuthProvider
  guards/ AuthGuard, RoleGuard
```

## Routes

| Path | Role |
|------|------|
| `/login` | public |
| `/app/businesses`… | SUPER_ADMIN |
| `/app/parties`… | BUSINESS_ADMIN |
| `/super-admin/*`, `/business/*` | **redirect** to `/app/*` |

## Env

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3001
# No NEXTAUTH_*
```

## Cookies

`spot_admin_rt` · `spot_admin_sid` · `spot_admin_aid` (HttpOnly on Nest origin)
