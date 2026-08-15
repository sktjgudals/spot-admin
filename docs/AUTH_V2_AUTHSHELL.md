# Cloudflare Admin Auth Web (spot-admin)

Admin authentication is served only by `spot-cloudflare-backend`.

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
| `/super-admin/dashboard` | SUPER_ADMIN |

The removed `/business/*` and non-dashboard `/super-admin/*` pages are not application routes.

## Env

```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Cookies

`spot_admin_rt` · `spot_admin_sid` · `spot_admin_aid` (HttpOnly on the API origin)
