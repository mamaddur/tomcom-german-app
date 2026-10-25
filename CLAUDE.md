# CLAUDE.md — TOMCOM German Learning App

Read this before any change. It records how this codebase is built and what Claude Code may and may not do.
Source of truth for scope: `TOMCOM_German_App_Requirements_Pack_v1.0` (BR / FR / NFR IDs). Design reference: `sprachbruecke.html` prototype.

## What we are building

A free, TOMCOM-funded app that teaches German from CEFR A1 to B1 to blue-collar workers from Telangana. All explanations are in Telugu and English.
Four front ends, one API:

| Front end | Users | Tech |
|---|---|---|
| Learner app (Android 8+/2 GB RAM, iOS 15+) | Learners | Flutter 3.47 |
| Admin portal | TOMCOM admins, trainers, super admin | Next.js 16 |
| Content studio | Content authors, reviewers | Next.js (same app as admin, separate route group and roles) |
| Verify page | Public (QR scan) | Next.js, server-rendered, no login |

Backend: NestJS 12 modular monolith (TypeScript, ES modules), Prisma 7 + PostgreSQL 16, Redis/BullMQ, S3-compatible storage + CDN, hosted in an Indian region.
See `docs/architecture.md` for the full picture and ADRs.

## Repository layout (ADR-002)

```
apps/
  mobile/          Flutter learner app            (has its own CLAUDE.md)
  web/             Next.js admin + studio + verify (has its own CLAUDE.md)
  api/             NestJS modular monolith        (has its own CLAUDE.md)
packages/
  api-client-ts/   generated from OpenAPI (web)
  content-schema/  JSON Schema for lesson packs (shared by api, studio, mobile)
infra/             Terraform — added once hosting is decided (ADR-011, ADR-014)
scripts/           dev-services.sh, verify.sh, install-tools.sh
docs/              architecture, data model, API, ADRs, runbooks
tools/seed/        synthetic data generator — the ONLY data source for dev/staging
```

## Non-negotiable rules (forbidden actions)

1. **Never merge your own PR.** Every PR needs passing CI, the automated review and one human approval.
2. **No production credentials, ever.** Do not request, read, store or use prod secrets. Prod deploys run only from the pipeline after tech-lead approval.
3. **No real learner data** in dev, staging, tests, fixtures, logs, prompts or screenshots. Use `tools/seed` synthetic data only (DPDP Act 2023).
4. **No PII in logs.** Phone numbers, names, districts and OTPs are never logged. Use the redacting logger.
5. **Apps never call vendors directly.** LLM, speech, SMS and push go through the API. The LLM receives only first name, level and lesson context (NFR-15).
6. **No secrets in code or git.** Use `.env.local` (git-ignored) for dev keys; CI uses the vault. Secret scanning blocks the PR otherwise.
7. **Do not change scope silently.** Anything outside the FR/NFR list, or anything that alters an `[A]` assumption, goes to `docs/open-questions.md` and waits for a human decision.
8. **Do not weaken guardrails** (branch protection, CI checks, rate limits, AI limits, RBAC) to make something pass.

## Every PR must

- Name the requirement IDs it covers in the title or first line, e.g. `[FR-401 FR-403] Quiz engine with randomised question bank`.
- Fill the PR template: requirement IDs, acceptance criteria covered, tests added, screenshots (synthetic data only), migration notes.
- Include tests: unit tests for logic, API integration tests per endpoint, and an end-to-end test for each user story touched (pack §2.3).
- Keep `docs/traceability.md` up to date (requirement → code → tests).
- Be one feature. Small PRs are better than large ones.

## Coding standards

- TypeScript strict mode; ESLint + Prettier. Dart: `flutter_lints` (strict), `dart format`.
- All UI strings externalised: Flutter ARB files, web `messages/{locale}.json`. Never hard-code a user-facing string (NFR-16).
- Learner-facing text: Telugu and English at minimum; German content always has audio (FR-302, NFR-17).
- Content and translations are keyed by locale (`{ "te": ..., "en": ... }`), not `_te`/`_en` columns, so adding a language needs no code change (ADR-007).
- API: REST under `/v1`, OpenAPI generated from NestJS decorators; breaking changes need a new version.
- DB changes only through migrations (Prisma Migrate). Never edit an applied migration.
- Stay on current major versions of frameworks. A major upgrade is its own PR (ADR-015). `pnpm.overrides` is only for patched transitive dependencies, each with a reason in ADR-015.
- Idempotency: every offline-queued write carries a client-generated UUID.
- Time: store UTC, display IST. Money: none (app is free).

## Definition of done

CI green (lint, types, tests, SAST, dependency scan, secret scan), acceptance criteria for the listed IDs have tests, docs updated, deployed to staging automatically and shown in the weekly demo.

## Commands

Requirements: Node 22, pnpm 10, Docker, Flutter 3.47.8 (`/opt/flutter/bin` on the build machine).

| Task | Command |
|---|---|
| First-time setup | `pnpm install && git config core.hooksPath .githooks && scripts/install-tools.sh` |
| Start / stop local Postgres + Redis (applies migrations) | `scripts/dev-services.sh up` / `down` / `reset` |
| Everything CI checks, locally | `scripts/verify.sh` (`--fast` skips integration, Flutter, Semgrep) |
| Lint / types / unit tests / build, all JS packages | `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` |
| Synthetic data | `pnpm --filter @tomcom/seed generate --learners 200` |
| Stop a background dev server | `scripts/stop-port.sh 3000 3001` |

Each app's own CLAUDE.md lists its `dev`, `test`, `lint` and `build` commands.

## Working locally (current mode, ADR-014)

There is no GitHub remote or cloud yet. Work happens on a branch per build step in the local git repo. Claude Code commits to that branch and stops; a human reviews the diff and merges into `main`. Claude Code never merges into `main`. `scripts/verify.sh` stands in for CI until the repo is on GitHub, where `.github/workflows/ci.yml` runs the same checks plus Semgrep registry rules and the OSV scan of Dart packages.

Synthetic phone numbers use the `+9155…` prefix, which no real Indian mobile has (`tools/seed`).
