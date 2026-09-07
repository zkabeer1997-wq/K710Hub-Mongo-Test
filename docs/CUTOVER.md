# K710Hub Mongo cutover checklist

## Env parity (Vercel → legendofzenzen710 project)

Required:
- `MONGODB_URI` — MongoDB Atlas connection string
- `MEMBER_SESSION_SECRET` — long random secret for member cookies
- `ADMIN_PASSWORD` — admin password login fallback
- `ADMIN_SESSION_SECRET` or reuse admin auth secret if used
- Kingshot login secrets used by `lib/kingshotLogin.js` (public key / signing material as already configured on Mongo-Test)

Optional / feature-specific:
- Gift code wiki fetch settings if used
- Any OCR / charm vision keys if those tools are enabled

Verify: Vercel project for `k710-hub-mongo-test` and future production domain share the same variable *names*; values may differ per environment.

## Data migration checklist

| Collection / domain | Source (Supabase / prod) | Target (Mongo) | Notes |
|---------------------|--------------------------|----------------|-------|
| alliances (+ bear_times_utc) | alliances | `alliances` | Include sort_order, active |
| events | events | `events` | Recurrence fields |
| kingdom_guides / guide content | guides tables | `kingdom_guides` / guide content | Access levels |
| content_blocks | content_blocks | `content_blocks` | home, about-record, about-sources |
| gallery | gallery | gallery collection | |
| members / submissions | member roster | submissions / roster | |
| kingshot_users | — | `kingshot_users` | Created on interest accept + login |
| interest submissions | interest | `interest_submissions` | Status workflow |
| gift codes / redemptions | gift schema | matching Mongo collections | |
| form gates / tool settings | settings tables | Mongo equivalents | |

Run: `MONGODB_URI=... node scripts/seed-public-content.mjs` after migration to fill missing public defaults.

## Image storage (no object storage on this stack)

Supabase Storage isn't part of this stack, so `admin-gallery` and
`admin-guide-images` store uploaded images as base64 data URLs directly in
their Mongo documents instead. MongoDB's hard cap is 16 MB per document, and
base64 inflates a file's size by ~33%, so upload caps are set well below
that: 4 MB for gallery images (`app/api/admin-gallery/route.js`), 3 MB for
guide images (`app/api/admin-guide-images/route.js`). Don't raise either cap
without re-checking the real per-document ceiling.

This works but doesn't scale: every read of a gallery/guide list pulls full
image bytes along with it, and the collection grows one image at a time
with no CDN caching. If image volume grows, move to GridFS or an external
object store (S3/R2/Vercel Blob) instead of raising these caps further.

## Smoke checklist (prod vs Mongo-Test)

Public:
- [ ] `/` language gate → home
- [ ] `/about` alliances + KvK record + rankings sections
- [ ] `/events` Bear Hunt + published events
- [ ] `/guides` list + one slug
- [ ] `/interest` submit → reference code
- [ ] `/interest/status?reference=...`
- [ ] `/tools` and `/forms` require Kingshot (no PIN field)
- [ ] `/admin/login` password + optional Kingshot admin

Admin (after login):
- [ ] Overview shell (sidebar + topbar)
- [ ] Events CRUD → appears on public `/events`
- [ ] Alliances Bear times → public Bear schedule updates
- [ ] Interest accept → kingshot user, no PIN returned
- [ ] KvK Members rally cutoff control visible
- [ ] Prep Ministers schedule cutoff control visible

Auth:
- [ ] PIN `/api/member-login` returns 410
- [ ] PIN `/api/member-register` returns 410
- [ ] Admin password still works
- [ ] Logout clears member + admin + login-flow cookies
