# CLAUDE.md — apps/web (admin portal, content studio, verify page)

Read the root `CLAUDE.md` first; its rules apply here.

## Commands
| Task | Command |
|---|---|
| Dev server on :3001 | `pnpm dev` |
| Tests (vitest) | `pnpm test` |
| Lint / types / build | `pnpm lint` / `pnpm typecheck` / `pnpm build` |
| Browser tests (starts API + web; needs `scripts/dev-services.sh up`) | `scripts/e2e-web.sh` (from the repo root) |

## Conventions
- Locale routing with next-intl: `/te/...` and `/en/...`. Default `te`. Strings live in `messages/<locale>.json`; the parity test fails if a key is missing in any locale.
- Route groups (from step 2): `(admin)` for TOMCOM/trainers/super admin, `(studio)` for authors/reviewers, `c/[code]` public verify page. Role checks happen on the server for every route group, never only in the UI.
- **Sessions:** the browser never holds API tokens. Server actions (`src/app/[locale]/login/actions.ts`) call the API and store tokens in httpOnly, SameSite=Strict cookies (`src/lib/session.ts`). `src/proxy.ts` renews the 5-minute access token; when the API refuses (30 min idle, 12 h cap), the cookies are cleared and the `(admin)` layout redirects to the login.
- Pages under `src/app/[locale]/(admin)/` require a staff session (checked in that layout). Server code calls the API through `src/lib/api.ts` (`server-only`).
- React 19 resets forms after a server action: return any value that must stay filled (never passwords) in the action state and use it as `defaultValue`.
- Next.js renders its own hidden `role="alert"` (route announcer); in tests, target error boxes by ID.
- Never call vendors from the browser.
- WCAG 2.1 AA (NFR-17): semantic HTML, labels on every control, visible focus, colour contrast ≥ 4.5:1.
