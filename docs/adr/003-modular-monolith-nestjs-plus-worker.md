# ADR-003: Modular monolith (NestJS) plus worker

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4.1, 4.7, NFR-06

## Context
Six logical services, small team, 2,000 DAU in year 1.

## Decision
One NestJS deployable with enforced module boundaries, and a worker process from the same image for queues.

## Consequences
Low operational cost now; modules can be split later without a rewrite.
