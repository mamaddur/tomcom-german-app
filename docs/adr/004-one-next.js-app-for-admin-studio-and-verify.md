# ADR-004: One Next.js app for admin, studio and verify

- Status: Accepted for build (planning approved 2026-10-25); architect sign-off pending
- Pack reference: 2.1

## Context
Three web front ends share auth, RBAC and design.

## Decision
One Next.js app with separate route groups and roles; verify page is public and server-rendered.

## Consequences
Less duplication; one deploy. Role checks must be strict per route group.
