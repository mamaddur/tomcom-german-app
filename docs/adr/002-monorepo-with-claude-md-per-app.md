# ADR-002: Monorepo with a CLAUDE.md per app

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4A.2, NFR-21

## Context
The pack suggests one repo per front end plus backend.

## Decision
One monorepo (pnpm workspaces + Flutter app) with a CLAUDE.md in each app.

## Consequences
Shared OpenAPI clients and lesson-pack schema, one CI, one PR per feature across API and app. Can be split at handover if TOMCOM prefers.
