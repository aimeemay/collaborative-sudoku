# Semantic Editing (Starter)

This starter uses a **simple, explicit semantic editing flow** for a collaborative checklist backed by Fluid SharedTree.

## Current Architecture

- User clicks **Smart fill** in [src/App.tsx](../src/App.tsx)
- UI sends current snapshot `{ title, items }` to `llm.suggestEdit(...)` via [src/infra/llmClient.ts](../src/infra/llmClient.ts)
- Response is normalized and applied through [applySemanticSuggestion](../src/infra/llmClient.ts)
- Tree mutations are executed through transactional helpers in [src/infra/sharedTreeClient.ts](../src/infra/sharedTreeClient.ts)

There is **no Tree-Agent runtime** or schema-exposed method execution path in the current starter.

## Request/Response Contract

### Request (from app to LLM)

```json
{
	"title": "Shared Checklist",
	"items": [{ "id": "...", "text": "Task", "done": false, "author": "user" }]
}
```

### Response (from LLM to app)

```json
{
	"title": "Optional updated title",
	"items": [{ "id": "optional", "text": "Task", "done": false, "author": "AI" }]
}
```

Notes:

- `title` is optional.
- `items` is optional.
- If `id` is missing, app generates one.
- If `done` is missing, app defaults to `false`.

## Modes

- **Mock mode (default)**: no endpoint configured, deterministic local behavior.
- **HTTP mode**: set `VITE_LLM_ENDPOINT`; app posts JSON and expects JSON.

## Safety Characteristics (today)

- Mutations are scoped to `title` and `items` only.
- SharedTree writes run in transactions.
- No free-form code execution from model output.

## Known Gaps (next hardening steps)

- No staged preview/approve UI for semantic suggestions.
- No semantic edit audit trail or rollback checkpoints.
- No strict action-based mutation contract yet (currently object-level suggestion contract).

## Recommended Next Steps

1. Introduce action schema (e.g., `add_item`, `toggle_item`, `update_title`, `replace_items`) validated before apply.
2. Add review step: preview diff, accept/reject.
3. Add semantic edit history and rollback support.
4. Add unit tests for malformed/partial LLM responses.
