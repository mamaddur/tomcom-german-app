# ADR-013: Authentication

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: NFR-10, FR-101, FR-107

## Context
OTP login for learners; 2FA for staff.

## Decision
OTP → 15-minute JWT access token + rotating, device-bound refresh token. Staff: argon2id password + OTP, 30-minute idle timeout.

## Consequences
Meets NFR-10; refresh reuse detection needed.
