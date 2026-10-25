# ADR-017: Object storage and media conversion

- Status: Accepted (build step 3c)
- Pack reference: FR-1002, NFR-04, NFR-14, 4.2 (S3-compatible object storage + CDN)

## Context
Lesson media (audio, images, later video) and lesson packs need durable storage in India and must be small enough for 3G and cheap prepaid data. Uploads come from authors, so the API treats them as untrusted files.

## Decision
- **Storage** sits behind the `ObjectStorage` interface (`apps/api/src/adapters/storage/`), implemented with the AWS S3 SDK against any S3-compatible store: AWS S3 in ap-south-1/2, or the State Data Centre's store (ADR-011). Dev and CI use **RustFS 1.0.3** (MinIO images are no longer pullable here). Production credentials come from the workload's role, never from code.
- **Conversion with ffmpeg** at upload time: audio → mono Opus, 24 kbps, max 30 s (≤ ~90 KB; NFR-04 limit 100 KB); images → WebP, max 800 px wide, ≤ 200 KB.
- **Untrusted input:** the type comes from ffprobe and an allowlist of container formats, never the file name. ffmpeg runs without a shell, with a 60 s limit and `-protocol_whitelist file`, so playlist-style files can't fetch URLs or read server files (tested). Uploads are capped at 15 MB.
- Learners never download from the studio media endpoints; media reaches them inside lesson packs (3b) via the CDN.

## Consequences
ffmpeg is a runtime dependency of the API image (CI installs it). Video (FR-305, ≤ 2 min, a Should) needs background transcoding and comes in a follow-up PR with the worker process.
