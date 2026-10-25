# ADR-001: Flutter for the learner app

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4.2, 4.7, NFR-01

## Context
Need one codebase for Android 8+ (2 GB RAM) and iOS 15+, with strong offline storage.

## Decision
Use Flutter (Dart). React Native is the fallback.

## Consequences
AOT-compiled, good performance on low-end Android, mature SQLite/drift for offline packs. Team must know Dart.
