# CLAUDE.md — apps/api (NestJS modular monolith)

Read the root `CLAUDE.md` first; its rules apply here.

## Commands
| Task | Command |
|---|---|
| Dev server (needs `scripts/dev-services.sh up` and `.env.local` from `.env.example`) | `pnpm dev` |
| Unit tests (no network) | `pnpm test` |
| Integration tests (real Postgres + Redis) | `pnpm test:int` |
| Lint / types | `pnpm lint` / `pnpm typecheck` |
| New migration | `pnpm prisma:migrate --name <change>` |
| Regenerate OpenAPI (commit the result) | `pnpm openapi` |

## Conventions
- One folder per module under `src/` (identity, content, learning, assessment, tutor, pronunciation, certificates, admin, notifications, settings, usage, privacy). A module exposes a service; other modules never import its internals or its Prisma models directly.
- Vendor SDKs only in `src/adapters/` behind an interface (ADR-010). Semgrep blocks imports elsewhere.
- Every route has a DTO with `@ApiProperty` so the OpenAPI spec and generated clients stay complete. After changing routes, run `pnpm openapi`; CI fails if `openapi.json` is stale.
- Log with the injected pino logger. Never log request bodies, headers or user objects. `src/logging/redact.ts` is a safety net, not permission.
- Raw SQL only through tagged `$queryRaw`. Never `$queryRawUnsafe`.
- Tests: `*.spec.ts` (unit, stub Prisma/Redis) next to code or in `test/`; `*.int-spec.ts` in `test/` for real services. Use `test/app.factory.ts`.
