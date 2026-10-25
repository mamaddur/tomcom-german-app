# Traceability: requirement → code → tests

Updated in every PR (CLAUDE.md). Only requirements with code are listed; see `build-plan.md` for where the rest land.

| Req | Status | Code | Tests |
|---|---|---|---|
| BR-02 | Foundation | Telugu default UI: `apps/mobile/lib/src/app.dart`, `apps/web/src/i18n/routing.ts` | `apps/mobile/test/app_test.dart` |
| NFR-01 | Foundation | Android minSdk 26: `apps/mobile/android/app/build.gradle.kts`; iOS 15.0 target | — (device testing from step 4) |
| NFR-04 | Foundation | Audio ≤100 KB in pack schema: `packages/content-schema/src/lesson-pack.schema.json` | `packages/content-schema/src/index.test.ts` |
| NFR-09 | Partial | PII-redacting logger `apps/api/src/logging/`; problem+json errors without PII `src/common/problem.filter.ts`; helmet headers; Semgrep project rules `.semgrep/project.yml`; gitleaks pre-commit + CI | `apps/api/src/logging/redact.spec.ts`, `apps/api/test/health.spec.ts` |
| NFR-16 | Foundation | Externalised strings: `apps/web/messages/*.json`, `apps/mobile/lib/l10n/*.arb`; locale-keyed content (ADR-007) | `apps/web/test/messages.test.ts`, `apps/mobile/test/l10n_parity_test.dart`, content-schema "extra locale" test |
| NFR-19 | Partial | Structured JSON logs with request IDs; `/v1/health/live`, `/v1/health/ready` | `apps/api/test/health.spec.ts`, `apps/api/test/health.int-spec.ts` |
| NFR-20 | Partial | CI `.github/workflows/ci.yml`, `scripts/verify.sh`, OpenAPI `apps/api/openapi.json` + generated TS client | CI itself; `packages/api-client-ts/src/index.test.ts` |
| FR-302 | Foundation | Pack validator: every German text must have audio in the pack | `packages/content-schema/src/index.test.ts` |
| FR-305 | Foundation | Pack schema: video under 2 minutes | `packages/content-schema/src/index.test.ts` |
| FR-401 | Foundation | Pack schema: five lesson-quiz question types only (ADR-009) | `packages/content-schema/src/index.test.ts` |
| 4A.2 | Done (local) | PR template, synthetic data only `tools/seed`, secret/SAST/dependency scanning | `tools/seed/src/synthetic.test.ts` |
| FR-101 | Done (API) | `apps/api/src/identity/otp.service.ts`, `auth.controller.ts`: OTP request/verify, rate limits, resend cooldown, 5-attempt lock | `apps/api/test/auth.int-spec.ts`, `src/common/phone.spec.ts` |
| FR-104 | Done (API) | Consent notice v1 (draft) migration; `consent.service.ts`; consent-first `account.service.ts` (architecture §3.5) | `apps/api/test/auth.int-spec.ts` |
| FR-107 | Done (API) | Sign-in on a new device keeps the same account; devices table | `apps/api/test/auth.int-spec.ts` |
| NFR-10 | Partial | 15-min JWT access tokens, rotating refresh tokens with reuse detection, OTP rate limits; deny-by-default `AuthGuard`. Staff 2FA in PR 2c | `apps/api/test/auth.int-spec.ts` |
| NFR-13 | Partial | Phone encrypted (AES-256-GCM) + HMAC lookup `src/common/pii-crypto.service.ts`; validation errors never echo values | `src/common/pii-crypto.service.spec.ts`, `test/auth.int-spec.ts` |
| FR-102 | Done (API) | Locale chosen at `/auth/register`, changed via `PUT /v1/me/locale` (`apps/api/src/learners/`) | `apps/api/test/me.int-spec.ts` |
| FR-103 | Done (API) | `PUT /v1/me/profile`; districts/trades reference data (te + en) `GET /v1/reference/*` | `apps/api/test/me.int-spec.ts` |
| FR-106 | Partial (API) | Join by batch code `POST /v1/me/batch` (rate-limited, one active batch per learner). Admin assignment: step 9 | `apps/api/test/me.int-spec.ts` |
| NFR-11 | Partial | `@Roles()` on routes, checked in `AuthGuard` | `apps/api/test/me.int-spec.ts` |
