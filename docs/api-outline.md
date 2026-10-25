# API outline — DRAFT for approval

REST, JSON, base path `/v1`. The OpenAPI 3.1 spec is generated from NestJS and published per build. Typed clients for Dart and TS are generated from it.
Auth: `Bearer` JWT. Roles in brackets. Errors use `application/problem+json` and carry a stable `code`, and the apps localise the message.
All writes from the mobile app accept `Idempotency-Key` or carry a `clientId`.

## Auth and onboarding
| Method | Path | Role | Req |
|---|---|---|---|
| POST | `/auth/otp/request` `{phone, locale}` | public | FR-101, NFR-10 (rate-limited) |
| POST | `/auth/otp/verify` `{phone, code, device}` → session, or `registration_required` + registration token for new numbers | public | FR-101, FR-107 |
| POST | `/auth/register` `{registrationToken, locale, consent, device}` → session. Creates user + consent + device in one transaction | public | FR-102, FR-104 |
| POST | `/auth/refresh` · `/auth/logout` | any | NFR-10 |
| POST | `/staff-auth/login` `{phone, password}` → challenge (OTP sent) → `/staff-auth/verify` `{challengeToken, code, device}` → session | staff | NFR-10 |
| GET | `/consent/notice?locale=` (public; consent itself is given in `/auth/register`) | public | FR-104, NFR-13 |
| GET/PUT | `/me` · `/me/profile` | learner | FR-102, FR-103, FR-802 |
| POST | `/me/enrolments` `{batchCode}` | learner | FR-106 |
| GET | `/reference/districts` · `/reference/trades` | public | FR-103 |
| GET | `/app/config?platform=&version=` → force update, maintenance, flags, learning rules (pass mark, unlocking, daily goal) | public | FR-1102, FR-1103, FR-204 |

## Learning (learner)
| Method | Path | Req |
|---|---|---|
| GET | `/levels` → levels with progress % | FR-201 |
| GET | `/announcements` → current announcements for everyone or the learner's batch (continue card, goal and streak are computed in the app from local progress) | FR-205 |
| GET | `/packs/{level}/latest` → `{version, manifestUrl, zipUrl, bytes, checksum}` (signed CDN URLs) | FR-307, NFR-02 |
| GET | `/lessons/{id}` (online fallback when the pack is not downloaded) | FR-301 |
| POST | `/sync` `{events:[progress, quizAttempt, bookmark, activity]}` → server state | FR-307, FR-405, NFR-05 |
| GET | `/placement-test` · POST `/placement-test/submit` | FR-105 |
| GET/POST/DELETE | `/bookmarks` · GET `/bookmarks/due` | FR-308 |

## Assessment (learner, online)
| Method | Path | Req |
|---|---|---|
| POST | `/checkpoints/{level}/attempts` → questions (no answers) | FR-404 |
| PUT | `/checkpoints/attempts/{id}/sections/{skill}` (answers, writing text, speaking audio) | FR-404, FR-407 |
| POST | `/checkpoints/attempts/{id}/submit` → result, certificate job | FR-404, FR-701 |
| GET/POST | `/mock-exams` · `/mock-exams/{id}/attempts` | FR-406 |

## Pronunciation
| POST | `/pronunciation/score` multipart `{refType, refId, audio(opus ≤200KB)}` → `{overall, words:[{text, score}]}` | FR-501–503 |

## Tutor
| Method | Path | Req |
|---|---|---|
| POST | `/tutor/conversations` `{mode, scenario?, replyLocale}` | FR-601, FR-605 |
| POST | `/tutor/conversations/{id}/messages` `{text}` or multipart audio → **SSE stream** of tokens, with `<de>` phrase markup | FR-601–604, FR-606 |
| GET | `/tutor/usage` → `{used, limit, resumesAt}` | FR-607 |
| POST | `/tutor/messages/{id}/flag` | FR-608 |
| GET | `/tts?text=&voice=` → cached audio URL (German phrases only) | FR-603 |

## Certificates and profile
| Method | Path | Role | Req |
|---|---|---|---|
| GET | `/me/certificates` · `/me/certificates/{id}/pdf` | learner | FR-701, FR-702 |
| GET | `/verify/{code}` (and the SSR page `/c/{code}`) | public | FR-703 |
| GET | `/me/stats` | learner | FR-801 |
| POST | `/me/privacy/export` · `/me/privacy/erase` | learner | FR-804 |
| PUT | `/me/devices/push-token` | learner | FR-803 |

## Admin portal (trainer, tomcom_admin, super_admin). Trainers are row-scoped to their batches.
| Method | Path | Req |
|---|---|---|
| CRUD | `/admin/batches` · POST `/admin/batches/{id}/import` (xlsx/csv) | FR-901 |
| CRUD | `/admin/learners` · GET `/admin/learners/{id}` (attempts, time, pronunciation, tutor usage) · POST `/admin/learners/{id}/notes` | FR-904, §2.1 |
| GET | `/admin/reports/{overview,completion,dropoff,readiness}?district&batch&trade&trainer&from&to&level` | FR-902, FR-903, FR-907 |
| POST | `/admin/reports/{type}/export` `{format: xlsx/pdf, filters}` → job → download | FR-905 |
| CRUD | `/admin/announcements` (+push) | FR-906 |
| POST | `/admin/certificates/{id}/revoke` | FR-704 |
| PUT | `/admin/writing/{id}/override` | FR-407 |
| GET/PUT | `/admin/tutor-flags` | FR-608 |
| CRUD | `/admin/users` (staff, roles) · GET `/admin/audit-log` | FR-908, FR-909 (super_admin) |
| GET / PUT | `/admin/settings` · `/admin/settings/{key}` `{value}` · `/admin/feature-flags` · `/admin/feature-flags/{key}` `{enabled}` (read: super_admin, tomcom_admin; write: super_admin) | FR-1101, FR-1103 |
| GET | `/app/config` (public): feature switches and learner limits | FR-1103 |
| GET/PUT | `/admin/app-versions` (step 10) | FR-1102 |

## Content studio (author, reviewer; super_admin read-only)
| Method | Path | Role | Req |
|---|---|---|---|
| GET | `/studio/levels` · `/studio/lessons?level=&status=` · `/studio/lessons/{id}` | all content roles | FR-1001 |
| POST | `/studio/lessons` `{level, title}` → new draft at the end of the level | author | FR-1001 |
| PUT | `/studio/lessons/{id}` `{expectedRevision, title, description, estMinutes, tradeTags, screens[], questions[]}` → new revision (409 on stale revision) | author | FR-1001, FR-1005 |
| POST | `/studio/lessons/{id}/transition` `{to: in_review/approved/draft, comment?}` | author submits/withdraws; reviewer approves/sends back | FR-1003 |
| POST | `/studio/lessons/{id}/comments` | author, reviewer | FR-1003 |
| GET / POST | `/studio/lessons/{id}/revisions` · `/studio/lessons/{id}/rollback {revision}` | read all / author | FR-1005 |
| PUT | `/studio/levels/{level}/lesson-order {lessonIds}` | author | FR-1001 |
| GET / POST / PUT | `/studio/vocab?q=` · `/studio/vocab/{id}` | read all / author | FR-1001, FR-306 |
| POST | `/studio/levels/{level}/publish` → immutable pack version (step 3b) | reviewer | FR-1004 |
| POST | `/studio/media` (step 3c) | author | FR-1002 |
| POST | `/studio/ai/*` (with the tutor, step 7) | author | FR-1006 |

## Internal / ops
`/health/live`, `/health/ready`, `/metrics` (Prometheus, not public).
