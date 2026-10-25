# ADR-005: PostgreSQL 16 with pgvector

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4.2, 4.3

## Context
Relational data, plus retrieval for the AI tutor.

## Decision
Managed PostgreSQL 16; pgvector for tutor retrieval over published content.

## Consequences
One database engine; scale is small (about 50k chunks).
