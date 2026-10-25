# Data model — DRAFT for approval

PostgreSQL 16. All PKs are UUIDv7 unless noted. All tables have `created_at` and `updated_at` (UTC).
`L10n` = `jsonb` of the form `{"te": "...", "en": "..."}`, validated so both launch locales are present before publish (ADR-007).
The owning module is shown in brackets; other modules may not write to its tables.

## Identity, consent, organisation [identity]

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, role (`learner`/`trainer`/`tomcom_admin`/`author`/`reviewer`/`super_admin`), phone_enc, phone_hmac (unique), first_name, last_name, ui_locale, status (`active`/`deletion_requested`/`deleted`), last_seen_at | One table for all actors. Phone is encrypted at the application level. |
| `admin_credentials` | user_id, password_hash (argon2id), totp_secret_enc nullable, failed_attempts, locked_until | Staff only (NFR-10). |
| `learner_profiles` | user_id PK, district_id, trade_id, target_job, self_declared_level, placement_level nullable, daily_goal_minutes | FR-103, FR-105 |
| `districts`, `trades` | id, code, name L10n | Reference data. 33 Telangana districts. Trades list comes from TOMCOM [A]. |
| `consents` | id, user_id, notice_version, purposes text[], locale, granted_at, withdrawn_at, ip_hash, device_id | FR-104, NFR-13. Rows are append-only. |
| `consent_notices` | version PK, body L10n, published_at | |
| `devices` | id, user_id, platform, app_version, push_token_enc, last_seen_at | FR-107, FR-1102 |
| `refresh_tokens` | id, user_id, device_id, token_hash, expires_at, revoked_at, replaced_by | Rotation with reuse detection. |
| `otp_challenges` | id, phone_hmac, code_hash, expires_at, attempts, consumed_at | Stored in Redis, with a DB mirror only for audit counts. |
| `batches` | id, code (unique, used for joining), name, district_id, trade_id, start_date, status | FR-106, FR-901 |
| `batch_trainers` | batch_id, trainer_id | FR-908 row scoping. |
| `enrolments` | id, learner_id, batch_id, source (`code`/`admin`/`bulk`), enrolled_at, left_at | |
| `trainer_notes` | id, learner_id, trainer_id, body, created_at | §2.1 trainer "add notes" |

## Content [content]

Draft content is edited in place. **Publishing creates an immutable `pack_version` snapshot** (ADR-008).

| Table | Key columns | Notes |
|---|---|---|
| `levels` | id, code (`A1`/`A2`/`B1`), title L10n, order | 3 rows. |
| `lessons` | id (stable), level_id, order, title L10n, description L10n, est_minutes, topic_tags[], video_asset_id nullable, status (`draft`/`in_review`/`approved`/`published`), current_revision | FR-1001, FR-1003 |
| `screens` | id, lesson_id, order, type (`explain`/`vocab`/`dialogue`/`practice`), body jsonb (typed by `content-schema`), vocab_ids[] | FR-301 |
| `vocab_items` | id, german, article (`der`/`die`/`das`/null), plural, meaning L10n, audio_asset_id, image_asset_id, trade_tags[] | FR-302, FR-305, FR-306. Reused across lessons. |
| `questions` | id (stable), lesson_id nullable, checkpoint_section_id nullable, type (`mcq`/`listen_choose`/`match_pairs`/`fill_gap`/`word_order`/`writing`/`speaking`), prompt L10n+de, payload jsonb, answer jsonb, explanation L10n, difficulty 1–3 | A bank of 15–20 per lesson (FR-401, FR-403). |
| `checkpoints` | id, level_id, pass_mark, time_limit_min | FR-404 |
| `checkpoint_sections` | id, checkpoint_id, skill (`reading`/`listening`/`writing`/`speaking`), question_count, weight | |
| `mock_exams` | id, level_id, format (`goethe`/`telc`/`osd`), sections jsonb | FR-406. The format depends on TOMCOM's choice of exam. |
| `media_assets` | id, type (`audio`/`image`/`video`), storage_key, mime, duration_ms, bytes, checksum_sha256, variants jsonb, uploaded_by | FR-1002. Transcoded to Opus/WebP/HLS by the worker. |
| `content_revisions` | id, entity_type, entity_id, revision, snapshot jsonb, author_id, created_at | FR-1005 history and rollback. |
| `review_comments` | id, entity_type, entity_id, revision, author_id, body, resolved_at | FR-1003 |
| `pack_versions` | id, level_id, version (int), manifest_key, zip_key, bytes, published_by, published_at, min_app_version | FR-1004, FR-307. Immutable. |
| `content_chunks` | id, pack_version_id, lesson_id, locale, text, embedding vector(…) | Tutor retrieval. Built only from published packs. |

## Learning and assessment [learning], [assessment]

| Table | Key columns | Notes |
|---|---|---|
| `lesson_progress` | learner_id, lesson_id (PK pair), best_score, passed, passed_at, updated_at | FR-203. Recomputable from attempts. Locked/available/in progress are worked out in the app. |
| `quiz_attempts` | id, client_id (unique), learner_id, lesson_id, pack_version, answers jsonb (`questionId`, `response`, `correct`), score, passed, duration_ms, finished_at, received_at | FR-405. Every attempt is kept. |
| `checkpoints` | id, level_id (unique), content jsonb (draft: passMark, draw, sections), revision, updated_by, published_content jsonb, published_revision, published_by, published_at | FR-404. Never shipped in a pack (ADR-009). |
| `checkpoint_attempts` | id, learner_id, level_id, checkpoint_revision, pass_mark, items jsonb (drawn, with answer keys; server only), responses jsonb, section_scores jsonb, writing_marks jsonb, total, status (`in_progress`/`awaiting_marking`/`passed`/`failed`/`expired`), started_at, expires_at, submitted_at, marked_by, marked_at | FR-404. Online only (ADR-009). |
| `writing_submissions` | id, attempt_ref, text, ai_score, ai_feedback L10n, rubric jsonb, trainer_score nullable, trainer_id, overridden_at | FR-407 |
| `pronunciation_attempts` | id, learner_id, ref_type (`vocab`/`sentence`/`checkpoint`), ref_id, overall_score, word_scores jsonb, vendor, latency_ms, created_at | FR-501, FR-502. No audio is stored (audio deleted after scoring [A]). |
| `bookmarks` | learner_id, vocab_id, ease, interval_days, due_at, reps | FR-308 (SM-2 spaced repetition). |
| `daily_activity` | learner_id, date (IST), seconds | FR-204 streaks. Also used for reporting; goal met = seconds ≥ goal at read time. |

## Tutor [tutor], usage [usage]

| Table | Key columns | Notes |
|---|---|---|
| `tutor_conversations` | id, learner_id, mode (`free`/`roleplay`), scenario nullable, reply_locale, created_at | FR-601, FR-605 |
| `tutor_messages` | id, conversation_id, role, text, input_mode (`text`/`voice`), tokens_in, tokens_out, filter_flags[], model, created_at | **Deleted after 90 days** (NFR-15). |
| `tutor_flags` | id, message_id, learner_id, reason, status (`open`/`valid`/`invalid`), reviewer_id, reviewed_at | FR-608. Kept beyond 90 days as a redacted copy. |
| `usage_counters` | learner_id, date, kind (`tutor_msg`/`stt_sec`/`tts_char`/`pron_attempt`), count | NFR-22. Hot counters live in Redis and are flushed nightly. |
| `tts_cache` | hash PK, voice, text, asset_key | §4.3 step 6 |

## Certificates [certificates]

| Table | Key columns | Notes |
|---|---|---|
| `certificates` | id, learner_id, level_id, verify_code (unique, 12 chars), name_on_cert, score, issued_at, pdf_key, status (`valid`/`revoked`), revoked_reason, revoked_by | FR-701–704 |

## Notifications, settings, admin [notifications], [settings], [admin]

| Table | Key columns | Notes |
|---|---|---|
| `batch_invites` | id, batch_id, phone_enc, phone_hmac (unique per batch), created_by, created_at, expires_at (90 days) | FR-901. Uploaded numbers that haven't registered. Claimed and deleted at registration; nothing but the number is stored. |
| `announcements` | id, title L10n, body L10n, batch_id (null = everyone), starts_at, ends_at, created_by. Push for FR-906 is added in step 9 | FR-205, FR-906 |
| `notification_log` | id, user_id, kind, sent_at, status | FR-803 |
| `settings` | key PK, value jsonb, updated_by | FR-1101 pass marks, AI limits, reminder schedule, monthly budget |
| `feature_flags` | key PK, enabled, rollout jsonb | FR-1103 |
| `app_versions` | platform, min_supported, latest, maintenance_message L10n | FR-1102 |
| `bulk_imports` | id, batch_id, file_key, rows_total, rows_ok, errors jsonb, created_by | FR-901 |
| `report_exports` | id, type, filters jsonb, format (`xlsx`/`pdf`), file_key, created_by | FR-905 |
| `audit_log` | id (bigserial), actor_id, actor_role, action, entity_type, entity_id, before jsonb, after jsonb (PII-redacted), ip_hash, at | FR-909. Append-only; the app DB role has INSERT only. |
| `privacy_requests` | id, user_id, type (`export`/`erase`), status, completed_at, file_key | FR-804, NFR-13 |

## Reporting views (read replica)
`rpt_learner_progress`, `rpt_level_completion`, `rpt_lesson_dropoff`, `rpt_readiness` (passed checkpoint, by level, batch, district and trade), `rpt_tutor_usage`. Dashboards and Excel/PDF exports both query these views. That is how the numbers stay the same (story 6).

## Retention
Tutor messages: 90 days. Pronunciation audio: deleted right after scoring. Erasure requests: profile and identifiers are deleted. Attempts are kept with a pseudonymous ID for aggregate statistics, **subject to confirmation by TOMCOM's DPO**. Backups: 30 days (NFR-08).

| `certificates` | id, code (unique, public), learner_id, level_id, attempt_id, holder_name (copied at issue; erased with the account), score, issued_at, revoked_at, revoked_by, revoke_reason | FR-701–705 |
| `word_list` | learner_id, vocab_id (PK pair), box (0–5), due (IST date), removed, updated_at (phone time, capped at server time + 1 day) | FR-308. Newest change wins. |
