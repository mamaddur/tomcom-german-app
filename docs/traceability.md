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
| NFR-10 | Done (API) | Learners: OTP, 15-min access, 60-day sliding refresh. Staff: password (argon2id, lockout after 5) + OTP, 5-min access, 25-min idle refresh (session ends within 30 idle minutes), 12-h maximum (`src/identity/staff-auth.service.ts`, `token.service.ts`). Staff can't use the learner OTP login | `apps/api/test/auth.int-spec.ts`, `test/staff.int-spec.ts`, `src/identity/passwords.spec.ts` |
| NFR-13 | Partial | Phone encrypted (AES-256-GCM) + HMAC lookup `src/common/pii-crypto.service.ts`; validation errors never echo values | `src/common/pii-crypto.service.spec.ts`, `test/auth.int-spec.ts` |
| FR-102 | Done (API) | Locale chosen at `/auth/register`, changed via `PUT /v1/me/locale` (`apps/api/src/learners/`) | `apps/api/test/me.int-spec.ts` |
| FR-103 | Done (API) | `PUT /v1/me/profile`; districts/trades reference data (te + en) `GET /v1/reference/*` | `apps/api/test/me.int-spec.ts` |
| FR-106 | Partial (API) | Join by batch code `POST /v1/me/batch` (rate-limited, one active batch per learner). Admin assignment: step 9 | `apps/api/test/me.int-spec.ts` |
| NFR-11 | Partial | `@Roles()` on routes, checked in `AuthGuard`; every staff mutation audited by `AuditInterceptor`. Trainer batch scoping arrives with the step 9 endpoints that need it | `apps/api/test/me.int-spec.ts`, `test/staff.int-spec.ts` |
| FR-909 | Done (API) | Append-only `audit_log` (DB trigger blocks UPDATE/DELETE/TRUNCATE), staff logins and mutations recorded without PII, `GET /v1/admin/audit-log` for super admins | `apps/api/test/staff.int-spec.ts` |
| Story 1 | Done (app + API) | Flutter onboarding `apps/mobile/lib/src/onboarding/`: bilingual welcome/phone/OTP, language choice, consent (not pre-ticked), profile, batch, home | `apps/mobile/test/onboarding_flow_test.dart` (whole flow in Telugu), `test/live_api_test.dart` (real API), `test/api_contract_test.dart` |
| NFR-18 | Partial | Large buttons, digits-only phone/OTP fields with auto-continue, dropdowns instead of typing, Telugu labels | `apps/mobile/test/onboarding_flow_test.dart` |
| NFR-10 (web) | Done | Admin portal sign-in (password → OTP) with tokens only in httpOnly SameSite=Strict cookies; proxy renews the session, idle/12-h limits enforced by the API (`apps/web/src/app/[locale]/login/`, `src/proxy.ts`, `src/lib/session.ts`) | `apps/web/e2e/staff-login.e2e.test.ts` (real browser + real API), `apps/web/test/session.test.ts` |
| FR-1001 | Done (API) | Studio API: levels, lessons (lesson + screens + questions saved as a unit), vocabulary, lesson order (`apps/api/src/content/`) | `apps/api/test/studio.int-spec.ts` |
| FR-1003 | Done (API) | draft → in_review → approved, send-back with required comment, review lock, four-eyes rule, comments (`studio.service.ts`) | `apps/api/test/studio.int-spec.ts` |
| FR-1005 | Done (API) | Snapshot per revision (`lesson_revisions`), optimistic concurrency, rollback as a new draft | `apps/api/test/studio.int-spec.ts` |
| FR-302 / BR-02 (content) | Enforced | Submitting for review needs every text in te + en and well-formed screens/questions (`@tomcom/content-schema` `validateLesson`) | `apps/api/test/studio.int-spec.ts`, `packages/content-schema/src/index.test.ts`, `src/content/lesson-shape.spec.ts` |
| FR-1002 | Partial (API) | Upload audio and images; converted to Opus/WebP and stored in S3-compatible storage (`apps/api/src/media/`, `src/adapters/storage/`, ADR-017). Video follows with the worker | `apps/api/test/media.int-spec.ts` |
| NFR-04 | Partial | Audio ≤ 100 KB (24 kbps Opus, ≤ 30 s), images WebP ≤ 800 px; pack schema also enforces the audio limit | `apps/api/test/media.int-spec.ts`, `packages/content-schema/src/index.test.ts` |
| FR-1004 | Done (API) | `POST /v1/studio/levels/{level}/publish` builds an immutable versioned pack (manifest + media zip), validated by `@tomcom/content-schema`; learners list and download packs (`apps/api/src/content/pack.service.ts`, `packs.controller.ts`) | `apps/api/test/packs.int-spec.ts` |
| FR-307 (server side) | Partial | Versioned pack zips per level with checksum and immutable caching; app download and sync come in steps 4–5 | `apps/api/test/packs.int-spec.ts` |
