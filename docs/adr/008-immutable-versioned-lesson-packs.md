# ADR-008: Immutable, versioned lesson packs

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4.4, 4.7, FR-307

## Context
Content updates must not break offline progress.

## Decision
Publishing creates an immutable pack version per level. Progress is keyed by stable lesson and question IDs, never by version.

## Consequences
Safe offline updates; IDs must never be reused with a new meaning.
