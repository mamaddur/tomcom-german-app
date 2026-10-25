# ADR-007: Locale-keyed content

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 2.4, NFR-16

## Context
Pack §2.4 uses title_te/title_en columns; NFR-16 says adding a language needs no code change.

## Decision
Store translatable text as jsonb keyed by locale ({"te":…,"en":…}); te and en are required before publish.

## Consequences
Meets NFR-16; departs from the pack's field names, so TOMCOM should confirm.
