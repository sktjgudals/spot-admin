# NextAuth Teardown — PR3 ✅

Auth v2 is the only admin auth path. NextAuth package, routes, and env are removed.

## What changed

| Area | Action |
|------|--------|
| `next-auth`, `@auth/prisma-adapter` | **uninstalled** |
| `src/lib/auth.ts`, `[...nextauth]`, `next-auth.d.ts` | **deleted** |
| `NEXTAUTH_*` env | **removed** from `.env.example` |
| `src/proxy.ts` | Nest cookies only; legacy UI redirects |
| `/super-admin/*` | → `/app/businesses` |
| `/business/*` | → `/app/parties` |
| `src/lib/api-auth.ts` | Nest `GET /auth/v2/admin/me` via Bearer (BFF leftover) |
| Root `/` | Auth v2 boot → role home |

## Browser cookies (verify in staging)

Expected:

- `spot_admin_rt`, `spot_admin_sid`, `spot_admin_aid` only (HttpOnly, Nest domain)
- **No** `next-auth.*` / `authjs.*` / `__Secure-next-auth.*`
- Access token only in memory

## Code search (should be ~0)

```
next-auth
getServerSession
useSession
SessionProvider
signIn(
NEXTAUTH_
getToken(
```

`signOut` may remain as an optional parameter name in `auth-session.ts` helper (not next-auth import).

## Unmigrated features

Legacy Prisma BFF under `/api/super-admin/*` and `/api/business/*` still exist for gradual Nest cutover. They now require **Bearer Admin JWT** via `requireRole` → Nest `/me`. UI no longer mounts those pages (proxy + layout redirect).

Future work: migrate banners/users/coupons/etc. to Nest or delete BFF.

## Auth v2 product surface (current)

| Role | Routes |
|------|--------|
| SUPER_ADMIN | `/app/businesses`, invitations, parties under `:businessId` |
| BUSINESS_ADMIN | `/app/parties` |

Login: `/login` → Nest Auth v2 cookies + memory AT.
