# Architecture — TOMCOM German Learning App

Status: **DRAFT for approval** · Based on Requirements Pack v1.0, Part 4 · Every decision below is a proposal until the tech lead signs it off.

## 1. Shape of the system

```
 Learner app (Flutter)   Admin portal + Content studio (Next.js)   Verify page (public)
          │                          │                                   │
          └──────────────┬───────────┴───────────────────────────────────┘
                         ▼
        Edge: CDN/WAF → load balancer → API (NestJS modular monolith, containers)
          auth · rbac · rate limits · audit interceptor · PII-redacting logger
          ┌──────────┬────────────┬──────────┬───────────────┬─────────────┬──────────┐
          │ identity │ content    │ learning │ assessment    │ tutor       │ pronun-  │
          │ & consent│ (studio,   │ & sync   │ (quiz, check- │ orchestrator│ ciation  │
          │          │ packs)     │          │ point, mock)  │             │          │
          ├──────────┼────────────┼──────────┼───────────────┼─────────────┼──────────┤
          │ certifi- │ admin &    │ notifi-  │ settings &    │ usage &     │ privacy  │
          │ cates    │ reports    │ cations  │ feature flags │ limits      │ (DPDP)   │
          └──────────┴────────────┴──────────┴───────────────┴─────────────┴──────────┘
                         │                 │                    │
    PostgreSQL (primary + read replica)   Redis (cache, limits, BullMQ jobs)   S3 + CDN (media, packs, cert PDFs)
                         │
   Outbound only, through adapters: LLM API · Speech (STT/TTS/scoring) · SMS OTP (DLT) · FCM/APNs · SMTP
```

The pack lists six services. Here they become **modules in one deployable (the API)** with enforced boundaries: each module owns its tables, other modules reach it only through its service interface, and a lint rule (`eslint-plugin-boundaries`) blocks cross-module imports. A module can be split out later without a rewrite (NFR-06).

A **worker** process runs from the same codebase and image and consumes BullMQ queues: certificate PDFs, push fan-out, media transcoding, report exports, 90-day tutor-log purge, and audio deletion after scoring.

## 2. Architecture decisions (ADRs to record in `docs/adr/`)

| ADR | Decision | Why | Pack ref |
|---|---|---|---|
| 001 | **Flutter** for the learner app | One codebase, AOT-compiled, good on 2 GB Android, mature offline storage (drift/SQLite). React Native is the fallback. | 4.2, 4.7 |
| 002 | **Monorepo** with a CLAUDE.md per app. The pack's alternative is one repo per front end. | Shared OpenAPI clients and pack schema; one CI; one PR per feature even when it touches API and app. Handover (NFR-21) is a single repo. Can be split at handover if TOMCOM prefers. | 4A.2 |
| 003 | **Modular monolith** (NestJS) + worker | Pack recommendation; one deployable at launch. | 4.7 |
| 004 | **One Next.js app** for admin portal, content studio and verify page | Shared auth/RBAC/design system; verify page is SSR and public. Separate route groups and roles. | 2.1 |
| 005 | **PostgreSQL 16** (managed) + **pgvector** for tutor retrieval | One database engine. Retrieval over about 50k chunks does not need a separate vector store. | 4.2, 4.3 |
| 006 | **Prisma** ORM + migrations | Typed queries, reviewable migrations. | NFR-20 |
| 007 | **Locale-keyed content** (`jsonb {te,en,…}`) instead of `title_te/title_en` columns | NFR-16 ("adding a language needs no code change") conflicts with the `_te/_en` fields in §2.4. Needs sign-off. | 2.4, NFR-16 |
| 008 | **Versioned, immutable lesson packs** per level; progress keyed by stable lesson/question IDs, never by version | Content updates must not break offline progress. | 4.4, 4.7 |
| 009 | **Lesson quizzes scored on device; checkpoint tests online and scored on the server** | Lesson quizzes must work offline (NFR-05). Checkpoint results drive certificates and exam nominations, so answer keys must not ship in the pack. Speaking and writing need the network anyway. | FR-404, FR-701 |
| 010 | **Vendor adapters** behind interfaces: `LlmProvider`, `SpeechProvider`, `SmsProvider`, `PushProvider` | Switch LLM vendor without app changes; India-region choice can change after the DPDP review. | 4.3, NFR-14 |
| 011 | **Cloud: AWS ap-south-1 (Mumbai) or ap-south-2 (Hyderabad)**, Terraform. State Data Centre is the alternative. | MeitY-empanelled, managed Postgres/Redis, India-region data. **TOMCOM must decide.** | 4.2, 4.7 |
| 012 | **Reporting** from the read replica: admin dashboards and exports use the same SQL views, so numbers match the export (story 6). Metabase is an optional extra for ad-hoc analysis. | Story 6 acceptance criteria. | FR-902, FR-905 |
| 013 | **Auth**: OTP → short-lived JWT access token (15 min) + rotating refresh token (device-bound). Admins: password (argon2id) + SMS/TOTP OTP, 30 min idle timeout. | NFR-10 | FR-101, FR-107 |

## 3. Key flows

### 3.1 Offline learning and sync (FR-307, NFR-05)
1. The app downloads `pack/{level}/{version}.zip`: a manifest JSON (lessons, screens, vocab, question bank with answers for lesson quizzes only) plus Opus audio (<100 KB per clip) and WebP images. The download is signed with a checksum per file. Downloads are allowed on Wi-Fi, or on mobile data with consent.
2. Progress, quiz attempts and bookmarks go to a local outbox (SQLite). Each item has a `client_id` UUID and a device timestamp.
3. `POST /v1/sync` uploads the outbox in batches. The server stores **every** attempt, which makes the upload idempotent on `client_id`, and recomputes lesson state with **best score wins**. It returns the server state, and the app overwrites its local derived state.
4. Unlock rules (pass mark, default 80%, FR-402) ship in the pack's settings block. The app unlocks the next lesson at once, offline too (story 2), and the server confirms on sync.
5. A new pack version only adds or changes content. Retired lessons keep their IDs and stay visible as "completed". A question is never re-used with a different meaning under the same ID.

### 3.2 AI tutor (FR-601–608, NFR-15, NFR-22)
1. The app sends `POST /v1/tutor/messages`, either as text or as audio that first goes through STT on the server.
2. The orchestrator checks the daily limit and the monthly budget in Redis. If the learner is over the limit, it returns `429` with `resumesAt` (story 4).
3. An input filter applies a topic classifier and safety checks. The orchestrator then builds the prompt: system rules, reply language, CEFR level, current lesson, last N wrong answers (FR-604) and retrieved passages from **published** content (pgvector).
4. The PII guard strips everything except first name, level and lesson context. Phone numbers, districts and similar data never leave the system.
5. The reply streams back over SSE. German phrases are marked `<de>…</de>`, and the app renders them tap-to-play (FR-603). TTS output is cached by `sha256(voice+text)` in S3.
6. An output filter runs, then the system logs messages, tokens and flags. A purge job deletes these logs after 90 days. Learners can flag a reply (FR-608), and flags go to the reviewer queue.

Target: first token under 3 s (story 4). The vendor must offer India-region processing, or else receive no personal data (NFR-14). See open questions.

### 3.3 Pronunciation (FR-501–503)
The app records 16 kHz mono Opus, capped at about 15 s. That keeps every attempt well under 200 KB. The API proxies the audio to the speech vendor's pronunciation assessment for `de-DE` and stores per-word scores (0–100). It deletes the audio as soon as scoring finishes. Words scoring under 60 are highlighted. Target: under 3 s on 4G.

### 3.4 Certificates (FR-701–705)
When a learner passes a checkpoint and every lesson in the level is at 80% or above, a job is queued. The job renders a PDF (Telugu and English fonts embedded) showing name, level, date, score, certificate ID and a QR code that links to `https://<verify-domain>/c/{code}`. The code is a random 12-character Crockford base32 string, so codes can't be guessed. The verify page shows name, level, date and status (valid or revoked). Target: under 1 minute (story 5). The PDF says plainly that it is a course-completion certificate and not an official exam result (FR-705).

## 4. Security and privacy (NFR-09–15)
- TLS 1.2+ everywhere. Encryption at rest is on for RDS, S3 and ElastiCache. Secrets live in AWS Secrets Manager.
- Phone numbers are stored encrypted at the application level (KMS envelope), with an HMAC column for lookup. Names and districts rely on DB-level encryption.
- RBAC is enforced in a guard on every route. Trainers are row-scoped to their batches by the query layer, not by the UI (FR-908).
- Every admin, trainer and studio mutation passes through an audit interceptor that writes to an append-only `audit_log` (FR-909).
- OTP rate limits apply per phone, device and IP. OTPs are 6 digits, expire in 5 minutes, and allow at most 5 tries.
- DPDP: a versioned consent notice in Telugu and English, with consent recorded before any profile data is saved (story 1). Learners can export their data and request erasure (FR-804). A named grievance officer is shown in the app. Breach runbook.
- CI runs CodeQL/Semgrep, OSV/Dependabot and gitleaks. The mobile app follows the MASVS checklist (certificate pinning optional, no secrets in the app bundle).

## 5. Capacity sketch (NFR-03, NFR-06)
2,000 DAU and 500 concurrent learners is a small load. Two API containers (1 vCPU / 2 GB each), one worker, a db.t4g.large-class Postgres with a read replica, and a small Redis are enough. Lesson content comes from the CDN, not the API. The load test in build step 10 checks API p95 under 500 ms at 500 concurrent virtual users, using a realistic mix (sync, tutor, quiz). The design holds to 100k registered users by scaling containers and the DB instance size, with no re-architecture.

## 6. Environments
`dev` (local docker-compose) → `staging` (auto-deploy from `main`, synthetic data) → `prod` (pipeline only, tech-lead approval, Claude Code holds no prod access).
