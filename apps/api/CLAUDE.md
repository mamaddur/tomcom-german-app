# CLAUDE.md — apps/api (NestJS modular monolith)

Read the root `CLAUDE.md` first; its rules apply here.

## Commands
| Task | Command |
|---|---|
| Dev server (needs `scripts/dev-services.sh up` and `.env.local` from `.env.example`) | `pnpm dev` |
| Unit tests (Vitest, no network) | `pnpm test` |
| Integration tests (real Postgres + Redis) | `pnpm test:int` |
| Build and run compiled | `pnpm build && pnpm start` |
| Lint / types | `pnpm lint` / `pnpm typecheck` |
| New migration | `pnpm prisma:migrate --name <change>` |
| Regenerate OpenAPI (commit the result) | `pnpm openapi` |

## Conventions
- **ES modules** (NestJS 12 is ESM-only). Relative imports end in `.js` (`import { x } from './x.js'`), even in `.ts` files.
- **Decorator metadata** must be emitted, or Nest injects `undefined`. `tsc` (build), SWC (Vitest via `unplugin-swc`, dev via `@swc-node/register`) all emit it. Do not use `tsx`/esbuild to run the API: it silently drops the metadata.
- **Prisma 7**: the client is generated into `src/generated/prisma` (git-ignored, created by `postinstall`). Use `PrismaService.db`, which connects through `@prisma/adapter-pg`. Migrate commands read `DATABASE_URL` via `prisma.config.ts` (environment first, then `.env.local`).
- One folder per module under `src/` (identity, content, learning, assessment, tutor, pronunciation, certificates, admin, notifications, settings, usage, privacy). A module exposes a service; other modules never import its internals or its Prisma models directly.
- Vendor SDKs only in `src/adapters/` behind an interface (ADR-010). Semgrep blocks imports elsewhere. Object storage: `OBJECT_STORAGE` (ADR-017).
- Never pass uploaded files to ffmpeg/ffprobe except through `src/media/ffmpeg.ts` (no shell, time limit, `-protocol_whitelist file`, format allowlist).
- Every route has a DTO with `@ApiProperty` so the OpenAPI spec and generated clients stay complete. After changing routes, run `pnpm openapi`; CI fails if `openapi.json` is stale.
- Log with the injected pino logger. Never log request bodies, headers or user objects. `src/logging/redact.ts` is a safety net, not permission.
- Raw SQL only through tagged `$queryRaw`. Never `$queryRawUnsafe`.
- Tests (Vitest, `vitest.config.ts`): `*.spec.ts` (unit, stub Prisma/Redis) next to code or in `test/`; `*.int-spec.ts` in `test/` for real services. Use `test/app.factory.ts`. Import `describe`/`it`/`vi` from `vitest`.
