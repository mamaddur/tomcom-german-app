# ADR-012: Reporting from shared SQL views

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: FR-902, FR-905

## Context
Dashboard numbers must match exports (story 6).

## Decision
Dashboards and Excel/PDF exports query the same views on the read replica.

## Consequences
One source of truth for numbers.
