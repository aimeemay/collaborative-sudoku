# Copilot Instructions for This Repo

You are editing a Fluid + React starter where collaboration correctness matters.

## Architecture Rules

- Shared data shape is defined only in [src/schema/starterSchema.ts](../src/schema/starterSchema.ts).
- SharedTree writes must go through [src/infra/sharedTreeClient.ts](../src/infra/sharedTreeClient.ts).
- UI should call helper functions; avoid direct tree mutation in components.
- Presence behavior lives in [src/infra/presenceClient.ts](../src/infra/presenceClient.ts).

## Semantic Editing Rules

- Semantic edits use action contracts in [src/infra/semanticActions.ts](../src/infra/semanticActions.ts).
- Keep parsing defensive and backward compatible.
- Keep staged review in UI before apply.
- Use audited apply/rollback flow from sharedTreeClient.

## Change Discipline

- Prefer small diffs and preserve existing style.
- Do not add dependencies unless necessary.
- Do not reintroduce legacy canvas/table/comment features unless explicitly requested.
- Keep local mode (`VITE_FLUID_CLIENT=local`) as the easiest default path.

## Validation

After changes, run:

- `npm run compile`
- `npm run test:unit` when unit tests exist for changed logic
- `npm run test` when UI collaboration behavior changed
