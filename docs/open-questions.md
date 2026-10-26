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
2. **Video upload (FR-305, Should)** needs background transcoding (a worker process) and follows in a separate PR. Audio and images are done.
3. **AI drafting help for questions and Telugu translations (FR-1006, Could)** is deferred to step 7, when the LLM vendor and key are settled.

## New from step 4

1. **Daily goal (FR-204) is minutes, not lessons.** The pack doesn't define it. I count minutes in lessons per day (IST), default 10, which admins can change (`goal.dailyMinutes`, 5–60). The streak is the number of days in a row with the goal met. One sitting counts at most an hour. Tell me if TOMCOM wants "one lesson a day" instead.
2. **Progress sync.** Lesson results and daily minutes sync with `POST /v1/sync`. The server keeps every quiz attempt. Lesson quizzes are scored on the phone (ADR-009), so the server trusts the score, but it never accepts a "pass" below 50% (the lowest pass mark an admin can set). Certificates rely on checkpoints, which the server scores itself.
3. **Lessons pass only by their quiz (FR-402).** A lesson with no questions passes when the learner finishes it.
4. **Quiz answers are taps, never typing** (NFR-18). "Fill the gap" offers choices, and "word order" uses word tiles. If TOMCOM wants typed answers for B1, they would be a new question type.
5. **Multiple-choice options keep the author's order**, so options like "all of the above" stay last. Pairs and word tiles are shuffled.

## New from step 5 (checkpoints)

1. **Checkpoint sections today: reading, listening and writing.** FR-404 also asks for speaking, which needs the speech vendor (C2). It joins when pronunciation scoring (step 6) is connected. Until then, a level can be passed without a speaking section. **Is that acceptable for the pilot, or should certificates wait for speaking?**
2. **Writing is marked by a trainer** against the author's marking guide. AI marking (FR-407) assists later, and the trainer can override it.
3. **Pass rule, my assumption:** the overall score across sections must reach the checkpoint's pass mark (default 60%, like Goethe A1). Tell me if each section needs its own minimum.
5. **Taking a checkpoint, my assumptions:** it opens once every published lesson of the level is passed. An attempt lasts at most 90 minutes, and a learner can start 3 a day. Reopening the app resumes the open attempt. Tell me if TOMCOM wants a waiting period after a fail.
4. **Checkpoint review is lighter than lessons:** an author saves drafts, and any reviewer who did not make the last edit publishes (four eyes). There is no separate "in review" state. Say if checkpoints need the full lesson workflow.

## CI: installing ffmpeg on GitHub's runners (needs your decision)

The "API integration tests" job sometimes times out while `apt-get` installs ffmpeg (#18, #19, #21, #22 and #25 hit it; re-running the job passes). Retries, an apt lock timeout and turning off man-db didn't remove it, and I can't read the runner logs from this session. Options:
1. **Copy static ffmpeg out of a Docker image pinned by digest** (`mwader/static-ffmpeg:7.1.1`). All media tests pass with it locally. It is third-party, so this is a supply-chain call; I prepared the change but did not commit it.
2. **Build our own small CI image** with ffmpeg once hosting is set up (step 10).
3. **Keep apt** and re-run when it hangs.

Until you choose, I'm re-running failed jobs. No check is skipped.

## New from step 9

1. **Bulk upload doesn't create accounts.** Pack §2 requires consent before personal data is saved (story 1). So an uploaded number is kept only as an invite: just the encrypted number, for 90 days. When that person registers in the app with their own consent, they join the batch automatically. People who already use the app move into the batch at once. Names in the file are ignored. **Removing expired invites needs the scheduled-jobs worker (step 10)**; until then they are only ignored after 90 days. Please confirm this matches how TOMCOM recruits.
2. **Staff see phone numbers masked** (`+91 •••••• 0101`) in the portal. Tell me if trainers need the full number to call learners.

## New from step 8

1. **Erasure is immediate (FR-804)**, with a confirmation on the phone and no waiting period. The API erases the name, phone number, profile, devices and sessions. Consent records stay, marked withdrawn, as evidence. Quiz attempts, lesson results and learning time stay under the now anonymous id, for statistics. This is the `[A]` assumption in `data-model.md` and **needs TOMCOM's DPO**. If the DPO wants those deleted too, it's a one-line change. The access token of the erased session stays valid for up to 15 minutes, but the account behind it no longer holds personal data.
3. **Certificate check page shows the full name** (story 5 asks for "name, level, date and status"), plus the score. After an erasure, the page shows "name withheld". The certificate text is my draft and **needs TOMCOM's approval and the Telugu reviewer**, especially the "not an official exam result" sentence (FR-705). Production needs `VERIFY_BASE_URL` on an https domain TOMCOM controls; boot fails otherwise.
2. **The data export is JSON**, opened in the phone's share sheet so the learner can save it or send it. If TOMCOM wants a PDF instead, tell me.

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

## Android build (PR 10b)

- **Store ID.** The Android `applicationId` is `in.gov.telangana.tomcom.tomcom_german` (iOS: `in.gov.telangana.tomcom.tomcomGerman`), a placeholder chosen at scaffold time. It cannot change after the first Play Store / App Store upload. Who owns the store accounts (TOMCOM or a Telangana government account), and which ID should they use?
- **Release signing.** Release APKs are signed with the debug key so CI can build them. The upload key must be created by the store-account owner and kept in the vault; Claude Code must not create or hold it.

## From step 7a (AI tutor API)

1. **No LLM vendor yet, so the tutor runs on a stand-in.** `LLM_PROVIDER=dev` answers a few greetings and otherwise suggests a first phrase. It is not a language model, the app labels its answers as a demo (`demo: true`), and the API refuses to start in production with it. **Needs:** the vendor decision (C2). Adding a vendor is one class in `src/adapters/llm/` plus the key; nothing else changes.
2. **First version differs from the architecture sketch (`docs/architecture.md` §3.2).** One running conversation per learner (no conversation object), plain JSON replies instead of an SSE stream, and the remaining count comes back with each reply instead of a separate usage endpoint. Scenarios (FR-605), voice (FR-602) and streaming follow with the vendor. **Needs:** a quick yes that this order is fine.
3. **Safety filter is a baseline.** A short list of unsafe topics in English and German, a 500-character limit, and a system prompt that limits topics. It has no Telugu word list and no topic classifier. **Needs:** the DPO/child-safety view on what must be blocked, and the vendor's own moderation once chosen (FR-606).
4. **The refusal text in Telugu is my draft.** It is in `apps/api/src/tutor/tutor-guard.ts`. **Needs:** the Telugu reviewer.
5. **Reviewers read learner messages.** The flag queue shows what the learner wrote and the reply, without name or phone, to judge a wrong answer. A reviewer can still recognise someone from what they wrote. **Needs:** DPO sign-off on this access (DPDP Act), and whether the `reviewer` role is the right one.
6. **Retention purge runs inside the API (hourly, safe to repeat).** It moves to the worker process when BullMQ is added (architecture §2).

