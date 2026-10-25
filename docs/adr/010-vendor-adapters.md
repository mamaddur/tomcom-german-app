# ADR-010: Vendor adapters

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4.3, NFR-14, NFR-15

## Context
LLM, speech, SMS and push vendors may change after the DPDP review.

## Decision
Interfaces LlmProvider, SpeechProvider, SmsProvider, PushProvider; SDK imports only in apps/api/src/adapters (enforced by Semgrep).

## Consequences
Vendor switch without app changes; PII guard sits in one place.
