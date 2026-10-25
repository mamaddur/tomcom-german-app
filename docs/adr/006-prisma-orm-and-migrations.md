# ADR-006: Prisma ORM and migrations

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: NFR-20

## Context
Need typed queries and reviewable schema changes.

## Decision
Prisma Client and Prisma Migrate. Raw SQL only via tagged templates (enforced by Semgrep).

## Consequences
Typed access; migrations reviewed in PRs.
