# TOMCOM German Learning App

German A1–B1 for workers from Telangana, in Telugu and English. Built for TOMCOM, Government of Telangana.

- Scope: `TOMCOM_German_App_Requirements_Pack_v1.0` (BR / FR / NFR IDs)
- How we work: [`CLAUDE.md`](CLAUDE.md)
- Design: [`docs/architecture.md`](docs/architecture.md), [`docs/adr/`](docs/adr), [`docs/data-model.md`](docs/data-model.md), [`docs/api-outline.md`](docs/api-outline.md)
- Plan and status: [`docs/build-plan.md`](docs/build-plan.md), [`docs/traceability.md`](docs/traceability.md), [`docs/open-questions.md`](docs/open-questions.md)

## Quick start

```bash
pnpm install
git config core.hooksPath .githooks
scripts/install-tools.sh            # gitleaks, osv-scanner, semgrep (pinned, checksum-verified)
scripts/dev-services.sh up          # Postgres 16 + pgvector, Redis; applies migrations
cp apps/api/.env.example apps/api/.env.local
pnpm --filter @tomcom/api dev       # http://localhost:3000/v1/health/ready · docs at /v1/docs
pnpm --filter @tomcom/web dev       # http://localhost:3001/te
scripts/verify.sh                   # everything CI checks
```

| Path | What |
|---|---|
| `apps/api` | NestJS API (modular monolith) |
| `apps/web` | Next.js admin portal, content studio, verify page |
| `apps/mobile` | Flutter learner app |
| `packages/content-schema` | Lesson-pack JSON Schema + validator |
| `packages/api-client-ts` | TypeScript client generated from the OpenAPI spec |
| `tools/seed` | Synthetic data generator (the only data allowed outside production) |
