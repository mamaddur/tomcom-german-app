# ADR-011: Cloud region

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 4.2, NFR-14

## Context
Data must stay in India; hosting is a TOMCOM decision.

## Decision
Proposed: AWS ap-south-1 or ap-south-2 with Terraform. Alternative: Telangana State Data Centre. Build proceeds locally until decided.

## Consequences
Infra code is written once the target is chosen.
