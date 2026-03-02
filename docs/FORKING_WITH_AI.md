# Forking This Repo with AI (Engineer Playbook)

This guide helps you fork this starter and build your own Fluid + React app while using AI assistants for implementation.

## 1) First 15 Minutes

1. Fork and clone.
2. Install dependencies:
    - `npm install`
3. Copy env defaults:
    - Copy `.env.defaults` to `.env` (local mode is the default).
4. Start local Fluid service in terminal A:
    - `npm run start:server`
5. Start frontend in terminal B:
    - `npm run dev`
6. Open `http://localhost:8080` in two tabs.

If `npm run dev` fails with "Port 8080 is already in use", free that port or run with a different one:

- `npm run dev -- --port 8081`

## 2) Mental Model for AI-Assisted Changes

- Shared persistent data lives in SharedTree schema:
    - [src/schema/starterSchema.ts](../src/schema/starterSchema.ts)
- Data mutations go through transaction helpers:
    - [src/infra/sharedTreeClient.ts](../src/infra/sharedTreeClient.ts)
- Presence is ephemeral and managed separately:
    - [src/infra/presenceClient.ts](../src/infra/presenceClient.ts)
- Semantic edit flow is action-based + staged approval:
    - [src/infra/semanticActions.ts](../src/infra/semanticActions.ts)
    - [src/infra/llmClient.ts](../src/infra/llmClient.ts)
    - [src/App.tsx](../src/App.tsx)

## 3) Standard AI Workflow (Recommended)

For each feature, ask AI to follow this sequence:

1. Update schema if needed.
2. Add/adjust mutation helpers in `sharedTreeClient`.
3. Update semantic action contract/parser if AI flow needs new operations.
4. Update UI (`App.tsx` or new components).
5. Add/adjust tests.
6. Run compile/tests and summarize changed files.

Use this prompt template:

> Implement feature X for this Fluid starter. Keep all shared-state changes in `starterSchema.ts` + `sharedTreeClient.ts`. If AI semantic edits need new behavior, extend `semanticActions.ts` and staged apply flow in `App.tsx`. Add tests and run `npm run compile`.

## 4) Guardrails for AI-Generated Code

- Do not mutate SharedTree directly from UI components.
- Prefer extending existing action contract over free-form payload handling.
- Keep semantic edits reviewable before apply.
- Keep changes small and transactional.
- Preserve backward compatibility for semantic payloads when practical.

## 5) Creating Your Own App (Checklist)

- Rename UI language + app title in [src/App.tsx](../src/App.tsx)
- Replace schema fields in [src/schema/starterSchema.ts](../src/schema/starterSchema.ts)
- Update mutation APIs in [src/infra/sharedTreeClient.ts](../src/infra/sharedTreeClient.ts)
- Rework semantic actions in [src/infra/semanticActions.ts](../src/infra/semanticActions.ts)
- Rework semantic provider logic in [src/infra/llmClient.ts](../src/infra/llmClient.ts)
- Add or remove presence signals in [src/infra/presenceClient.ts](../src/infra/presenceClient.ts)

## 6) Quality Gates Before PR

Run:

- `npm run compile`
- `npm run test:unit`
- `npm run test` (when you changed end-to-end behavior)

## 7) Azure Move-Over (Later)

Start local-first. Switch only after your app model stabilizes:

- Set `VITE_FLUID_CLIENT=azure`
- Configure Azure env vars in `.env`
- Ensure token provider endpoint returns valid Fluid JWTs
