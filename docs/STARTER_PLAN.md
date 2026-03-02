# Starter Status and Roadmap

## Current State (March 2026)

The repo is already converted to a minimal Fluid + React starter:

- SharedTree checklist model (`title`, `items`) in [src/schema/starterSchema.ts](../src/schema/starterSchema.ts)
- Transactional data helpers in [src/infra/sharedTreeClient.ts](../src/infra/sharedTreeClient.ts)
- Presence clients in [src/infra/presenceClient.ts](../src/infra/presenceClient.ts)
- Semantic suggestion client in [src/infra/llmClient.ts](../src/infra/llmClient.ts)
- Single starter entry in [src/start/starterStart.tsx](../src/start/starterStart.tsx)

## What This Means

This document is no longer a "conversion plan". The conversion is complete.
The focus is now **hardening for AI-assisted development and production-like collaboration workflows**.

## Hardening Roadmap

### Phase 1 — Documentation Alignment

- Keep docs consistent with the current starter implementation.
- Remove references to non-existent paths/components.
- Ensure one canonical architecture narrative.

### Phase 2 — AI Mutation Contract

- Introduce schema-validated semantic actions.
- Keep model output constrained to known operations.
- Reject malformed or out-of-scope actions.

### Phase 3 — Staged Semantic Apply

- Add suggestion staging, diff preview, and accept/reject UX.
- Prevent immediate, implicit semantic write-through.

### Phase 4 — Recovery and Auditability

- Add semantic edit history metadata.
- Add rollback/restore checkpoints for accepted edits.

### Phase 5 — Test Confidence

- Add unit tests for mutation helpers and semantic mapping.
- Add real two-page collaboration tests (same container id sync).
- Keep Playwright smoke tests aligned with current UI.

### Phase 6 — CI Gates and Cleanup

- Enforce compile/lint/unit/e2e smoke in CI.
- Prune stale placeholder tests/docs and legacy artifacts.

## Definition of Done

The starter is considered hardened when:

- Semantic edits are validated, reviewable, and reversible.
- Collaboration behavior is verified by multi-client tests.
- Docs and implementation are in sync.
- CI pass is a reliable quality signal for assistant-generated changes.
