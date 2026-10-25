# ADR-009: Checkpoint tests online and server-scored

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: FR-404, FR-701

## Context
Lesson quizzes must work offline, but certificates must be trustworthy.

## Decision
Lesson quizzes are scored on the device from the pack. Checkpoint tests are served and scored by the server; their answers never ship in a pack.

## Consequences
Certificates cannot be forged from pack contents. Checkpoints need a connection, which speaking and writing need anyway.
