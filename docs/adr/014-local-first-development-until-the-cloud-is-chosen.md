# ADR-014: Local-first development until the cloud is chosen

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: Build plan step 1

## Context
Hosting and GitHub repo are not set up yet.

## Decision
Build and verify locally (docker-compose services, scripts/verify.sh). CI workflow is ready for GitHub. Staging deploy and Terraform are added when the cloud decision (ADR-011) is made.

## Consequences
Step 1's staging auto-deploy is deferred; everything else in step 1 is done.
