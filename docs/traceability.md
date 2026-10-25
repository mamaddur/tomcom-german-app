# Traceability: requirement → code → tests

Updated in every PR (CLAUDE.md). Only requirements with code are listed; see `build-plan.md` for where the rest land.

| Req | Status | Code | Tests |
|---|---|---|---|
| BR-02 | Foundation | Telugu default UI: `apps/mobile/lib/src/app.dart`, `apps/web/src/i18n/routing.ts` | `apps/mobile/test/app_test.dart` |
| NFR-01 | Foundation | Android minSdk 26: `apps/mobile/android/app/build.gradle.kts`; iOS 15.0 target | — (device testing from step 4) |
| NFR-04 | Foundation | Audio ≤100 KB in pack schema: `packages/content-schema/src/lesson-pack.schema.json` | `packages/content-schema/src/index.test.ts` |
| NFR-09 | Partial | PII-redacting logger `apps/api/src/logging/`; helmet headers; Semgrep project rules `.semgrep/project.yml`; gitleaks pre-commit + CI | `apps/api/src/logging/redact.spec.ts`, `apps/api/test/health.spec.ts` |
| NFR-16 | Foundation | Externalised strings: `apps/web/messages/*.json`, `apps/mobile/lib/l10n/*.arb`; locale-keyed content (ADR-007) | `apps/web/test/messages.test.ts`, `apps/mobile/test/l10n_parity_test.dart`, content-schema "extra locale" test |
| NFR-19 | Partial | Structured JSON logs with request IDs; `/v1/health/live`, `/v1/health/ready` | `apps/api/test/health.spec.ts`, `apps/api/test/health.int-spec.ts` |
| NFR-20 | Partial | CI `.github/workflows/ci.yml`, `scripts/verify.sh`, OpenAPI `apps/api/openapi.json` + generated TS client | CI itself; `packages/api-client-ts/src/index.test.ts` |
| FR-302 | Foundation | Pack validator: every German text must have audio in the pack | `packages/content-schema/src/index.test.ts` |
| FR-305 | Foundation | Pack schema: video under 2 minutes | `packages/content-schema/src/index.test.ts` |
| FR-401 | Foundation | Pack schema: five lesson-quiz question types only (ADR-009) | `packages/content-schema/src/index.test.ts` |
| 4A.2 | Done (local) | PR template, synthetic data only `tools/seed`, secret/SAST/dependency scanning | `tools/seed/src/synthetic.test.ts` |
