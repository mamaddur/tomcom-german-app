# ADR-015: Current framework majors and ES modules

- Status: Accepted (approved by the project owner, 2026-10-25)
- Pack reference: NFR-09, NFR-20, 4A.3 (monthly patching)

## Context
Step 1 started on NestJS 11, Next.js 15 and Prisma 6 while NestJS 12, Next.js 16 and Prisma 7 were already current. Their older transitive dependencies carried known advisories that had to be pinned with overrides. Building seven months of code on superseded majors would make the first post-launch upgrade expensive.

## Decision
- API: NestJS 12, which is ESM-only, so the API is an ES module package (`"type": "module"`, `nodenext` resolution, `.js` import suffixes). nestjs-pino 5 / pino 10.
- Tests for the API move from Jest to Vitest 5 (already used everywhere else) with `unplugin-swc` for decorator metadata. The dev server runs through `@swc-node/register` for the same reason. `tsx` is not used.
- Prisma 7 with the pg driver adapter and `prisma.config.ts` (see ADR-006).
- Web: Next.js 16 (`middleware.ts` → `proxy.ts`, flat ESLint configs from `eslint-config-next`).
- TypeScript stays on 5.9: `@nestjs/swagger` 12 supports TypeScript 5.5–6. ESLint stays on 9 until typescript-eslint supports 10.

## Overrides still in place
| Override | Reason | Remove when |
|---|---|---|
| `multer@<2.5.0 → ^2.5.0` | `@nestjs/platform-express` 12.2.0 pins multer 2.4.0 (GHSA-q7qp-rjg7-q26m, high) | NestJS ships multer ≥ 2.5 |

## Consequences
`pnpm audit` is clean. Contributors must keep `.js` suffixes on relative imports in the API. Any future major upgrade is its own PR.
