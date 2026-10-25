# CLAUDE.md — apps/web (admin portal, content studio, verify page)

Read the root `CLAUDE.md` first; its rules apply here.

## Commands
| Task | Command |
|---|---|
| Dev server on :3001 | `pnpm dev` |
| Tests (vitest) | `pnpm test` |
| Lint / types / build | `pnpm lint` / `pnpm typecheck` / `pnpm build` |

## Conventions
- Locale routing with next-intl: `/te/...` and `/en/...`. Default `te`. Strings live in `messages/<locale>.json`; the parity test fails if a key is missing in any locale.
- Route groups (from step 2): `(admin)` for TOMCOM/trainers/super admin, `(studio)` for authors/reviewers, `c/[code]` public verify page. Role checks happen on the server for every route group, never only in the UI.
- Talk to the API only through `@tomcom/api-client-ts`. Never call vendors from the browser.
- WCAG 2.1 AA (NFR-17): semantic HTML, labels on every control, visible focus, colour contrast ≥ 4.5:1.
