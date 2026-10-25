# Build plan — DRAFT for approval

**Step 0 (this one) is planning.** I stop after it and wait for your approval. After that I build in 10 steps, each as one or more PRs that name their requirement IDs. Steps end in the same order as the pack's approval gates.

```
Step 0 plan ──► [Gate 1: requirements signed off, end M1]
Steps 1–9 build ──► [Beta for UAT, end M5: all Must built + tests green, A1 content complete, staging open to TOMCOM]
Step 10 harden + release ──► [Gate 2: pilot go/no-go + launch, end M6] ──► [Hypercare complete, end M7]
```

Steps 4–9 can run as parallel streams once steps 1–3 are merged (pack 4A.4).

| # | Step | Requirements | Done when |
|---|---|---|---|
| 1 | **Foundations.** Monorepo, three app skeletons, docker-compose dev stack, CI (lint, types, tests, CodeQL/Semgrep, OSV, gitleaks), PR template with requirement IDs, OpenAPI → generated clients, Terraform for dev + staging, staging auto-deploy, synthetic data seeder, redacting logger, Sentry/OTel wiring, ARB/i18n setup in te+en | NFR-09, NFR-16, NFR-19, NFR-20, 4A.2 | A green pipeline deploys "hello" to staging. Branch protection is on. |
| 2 | **Identity and onboarding.** OTP login, language choice, consent, profile, batch code, multi-device sync of identity, admin login with 2FA, RBAC guard, audit interceptor | FR-101–104, FR-106, FR-107, NFR-10, NFR-11, NFR-13, NFR-18 | Story 1 E2E passes: OTP to language screen in under 60 s, all screens in Telugu, consent recorded before profile data is saved. |
| 3 | **Content model and studio.** Entities, media upload + transcode, draft → review → approved → published workflow, comments, revisions and rollback, pack builder, settings and feature flags, AI draft assist | FR-1001–1006, FR-1101, FR-1103, NFR-04 | An author creates an A1 lesson. A reviewer publishes it. A versioned pack appears on the CDN. |
| 4 | **Learner app core.** Dashboard, level progress, continue card, lesson list states, lesson player (explain, vocab, dialogue, practice), audio with 0.75× speed and repeat, images and video, trade packs, streak and daily goal, announcement banner, bookmarks + SRS | FR-201–205, FR-301–306, FR-308, NFR-01, NFR-03, NFR-17 | A seeded A1 lesson plays end to end on a 2 GB Android emulator profile with cold start under 3 s. |
| 5 | **Quizzes, unlocks, offline.** Five question types, random bank draw, 80% unlock (configurable), wrong-answer review and retake, attempt storage, pack download, outbox sync with best score wins, placement test, checkpoint tests (online), mock exams | FR-105, FR-307, FR-401–406, NFR-02, NFR-05 | Story 2 E2E passes, including in airplane mode. Sync conflict tests pass. |
| 6 | **Pronunciation.** Record, compress, score per word, highlight words under 60, replay model audio; audio deleted after scoring | FR-501–503 | Story 3 passes: score returns in under 3 s on a throttled 4G profile, and each upload is under 200 KB. |
| 7 | **AI tutor.** Orchestrator, provider adapter, retrieval, PII guard, topic and safety filters, SSE streaming, `<de>` tap-to-play + TTS cache, voice in/out, role-plays, daily limits, flag queue, 90-day purge, AI writing marking with trainer override | FR-407, FR-601–608, NFR-15, NFR-22 | Story 4 passes: first token in under 3 s. A red-team prompt set is refused. A test asserts no PII appears in vendor payloads. |
| 8 | **Certificates, profile, notifications.** Issue rule, PDF with QR, verify page, revoke, profile stats, edit profile, push reminders (daily goal, 3-day and 7-day inactivity), data export and erasure | FR-701–705, FR-801–804 | Story 5 passes: certificate in under 1 minute and the QR verifies. Erasure removes PII (tested). |
| 9 | **Admin portal and reports.** Batches and bulk import, dashboard, filters, learner detail, Excel/PDF export, announcements + push, readiness list, trainer row scoping, audit log viewer, tutor flag review | FR-901–909, NFR-17 (WCAG 2.1 AA) | Story 6 passes: dashboard numbers equal export numbers for the same filters. A trainer can't see other batches (tested). An axe scan is clean. |
| — | **Beta for UAT gate** | all Must | All 48 Must requirements are built and covered by tests. A1 content is loaded. TOMCOM gets staging access. |
| 10 | **Harden and release.** Force-update and maintenance messages, load test (2,000 DAU / 500 concurrent), backups + restore drill (RPO 24 h, RTO 8 h), VAPT readiness checklist and fixes, MASVS checklist, store builds signed in CI, listings, prod Terraform (applied by pipeline, approved by the tech lead), runbooks, maintenance jobs (4A.3), monthly usage report, handover docs | FR-1102, NFR-06–08, NFR-12, NFR-14, NFR-21, 4A.3 | Gate 2 evidence pack is ready. After launch: hypercare until crash-free sessions are above 99%, then handover. |

## Traceability check (all 65 FRs placed)
- Step 2: FR-101, 102, 103, 104, 106, 107
- Step 3: FR-1001–1006, 1101, 1103
- Step 4: FR-201–205, 301–306, 308
- Step 5: FR-105, 307, 401–406
- Step 6: FR-501–503
- Step 7: FR-407, 601–608
- Step 8: FR-701–705, 801–804
- Step 9: FR-901–909
- Step 10: FR-1102

## What I need before Step 1
See `docs/open-questions.md`, section A: GitHub repo, dev-only LLM/speech/SMS keys, and the two missing input files.
