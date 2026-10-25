# Open questions

Planning approved on 2026-10-25 with "do it on this local machine for now". Step 1 is built locally (ADR-014).

## New from step 1

1. ~~Framework major upgrades~~ **Done** (approved 2026-10-25): NestJS 12 (ESM), Next.js 16, Prisma 7, Vitest 5. See ADR-015. One override is left (multer), and it has a removal condition.
2. **Placeholder app name.** The learner app shows "German for Work" / "పని కోసం జర్మన్" until TOMCOM decides branding (D). The Telugu UI strings are my drafts and need the Telugu reviewer.
3. **This machine is a cloud container, not your computer.** Work here is lost when the session's container is reclaimed. Until a GitHub repo exists, nothing is backed up. **Please create the repo soon** (A2), or download the work.
4. **Not checkable here, checked in CI only:** Semgrep registry rulesets (semgrep.dev blocked) and the OSV scan of Dart packages (api.osv.dev blocked). No Android SDK or Xcode here, so there are no device builds yet. Device builds need the Android SDK (step 4).
5. **Staging auto-deploy and Terraform** (step 1 in the plan) are deferred until hosting is decided (C4).
6. **S3-compatible storage for local dev.** The `minio/minio` image can't be pulled here. I'll pick an alternative in step 3, when media upload needs it.
7. **Automated PR review** (Claude Code GitHub Action, pack 4A.1) needs the GitHub repo and an API key secret. I'll add it once both exist.

## A. Needed from you before Step 1

1. **Missing inputs.** These two files didn't reach this session:
   - the kickoff prompt text (the 10-step plan in `build-plan.md` is my reconstruction; send the prompt and I'll reconcile it)
   - `sprachbruecke.html`, the prototype and design reference. Screens, colours, layout and the 48-lesson outline will follow it once I have it.
2. **GitHub repo.** Name/URL and confirmation of the monorepo layout (ADR-002), or one repo per front end as in pack 4A.2.
3. **Dev-only API keys**, stored as session environment secrets and never pasted into chat:
   - LLM: which vendor? (see C2)
   - Speech: German pronunciation assessment, STT and TTS (e.g. Azure AI Speech, Central India)
   - SMS: a DLT-registered gateway in sandbox/test mode
   - Also, later: a Firebase project for FCM (dev), and an Apple developer team for APNs/TestFlight (can wait until step 8).
4. **Branch protection** on `main`, set by a repo admin: required checks plus one human approval. I can't merge my own PRs.

## New from step 2

1. **Consent notice v1 is a draft.** Its English and Telugu text is in `apps/api/prisma/migrations/20261025083000_consent_notice_v1`. **Needs:** TOMCOM legal/DPO review, Telugu reviewer, and the grievance officer's name. A corrected notice becomes version 2 in a new migration; learners who accepted v1 keep their v1 record.
2. **OTP limits** (5 codes per number per hour, 30 per network address per hour, 30-second resend wait, 5 tries per code) are my defaults for NFR-10. They become admin-configurable with FR-1101 in step 3.
3. **Telugu names of the 33 districts and 7 trades** (`apps/api/prisma/migrations/20261025100200_reference_districts_trades`) are my transliterations and need the Telugu reviewer. The trade list is a placeholder until TOMCOM confirms it (D).
4. **SMS gateway.** Until a DLT-registered gateway and a dev key exist, only synthetic `+9155…` numbers can sign in (OTP `123456`, no SMS sent). This also guarantees no real numbers in dev.

## New from step 3

1. **Vocabulary edits are not reviewed one by one.** Vocabulary is shared across lessons. A change reaches learners only when a reviewer next publishes a level, and the published pack is checked as a whole at that moment (step 3b). If TOMCOM wants every vocabulary change reviewed separately, it becomes its own workflow.
2. **AI drafting help for questions and Telugu translations (FR-1006, Could)** is deferred to step 7, when the LLM vendor and key are settled.

## B. Decisions on the plan (my recommendation first)

1. ADR-007: **locale-keyed content (`jsonb`) instead of `_te/_en` columns.** This departs from pack §2.4 so the system can meet NFR-16. Recommend: yes.
2. ADR-009: **checkpoint tests online-only, scored on the server.** Lesson quizzes stay offline. Recommend: yes. Without this, certificates could be forged from the answer keys in the pack.
3. ADR-004: **one Next.js app** for admin portal + content studio + verify page. Recommend: yes.
4. ADR-002: **monorepo**. Recommend: yes, splittable at handover.

## C. For the architect (pack 4.7), with my recommendation

1. Flutter or React Native → **Flutter**.
2. LLM and speech vendors with India-region processing (NFR-14). The LLM must be confirmed against the DPDP review. Options to evaluate: a hosted LLM through a cloud provider's India region (e.g. AWS Bedrock or Azure in Mumbai/Central India), checking which models are actually served in-region, and Telugu quality against the 3 s first-token target. If no model runs in-region, the fallback is NFR-14's "receives no personal data", which the PII guard already enforces. **This needs your DPO's view.**
3. Monolith or services → **modular monolith + worker**.
4. Hosting → **AWS Mumbai/Hyderabad** unless TOMCOM requires the State Data Centre.
5. Pack versioning → ADR-008 (immutable packs, stable IDs, best score wins).
6. Load test → k6 against staging: 500 concurrent VUs, a 2,000-DAU daily mix, p95 under 500 ms.
7. Passing VAPT first time → ASVS L2 checklist in CI from step 1, MASVS for the apps, an internal pre-VAPT scan in step 10.

## D. TOMCOM `[A]` assumptions still to confirm
Learner numbers, trades and districts · target exam (Goethe / telc / ÖSD) for mock exams · hosting · content ownership · store accounts under TOMCOM · branding and app name · whether pronunciation audio is deleted after scoring · learner import format · whether attempt data is kept pseudonymised after an erasure request · grievance officer name.

## E. Content (from the handwritten A1 sheet, see `content/a1-syllabus-notes.md`)
1. The referenced videos appear to be third-party. **Do you have a licence to use them in the app?** If not, I'll treat them as a teaching reference only.
2. Their length (4–13 min) is over FR-305's "under 2 minutes". Short in-house clips, or none?
3. Confirm the proposed A1 order: 17 lessons + checkpoint, with "introducing someone" added as its own lesson.
