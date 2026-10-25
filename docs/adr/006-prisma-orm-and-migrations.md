# ADR-006: Prisma ORM and migrations

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: NFR-20

## Context
Need typed queries and reviewable schema changes.

## Decision
Prisma 7: the `prisma-client` generator (ESM, output in `apps/api/src/generated/prisma`), the `@prisma/adapter-pg` driver adapter at runtime, and `prisma.config.ts` for Migrate. Raw SQL only via tagged templates (enforced by Semgrep).

## Consequences
Typed access; migrations reviewed in PRs.
