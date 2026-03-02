# Fluid + React + Tailwind Starter

Purpose-built as a lean starting point for Fluid apps. It ships a minimal SharedTree data model, Presence API wiring, and a constrained semantic-suggestion (LLM) hook—ready for a coding agent to extend.

Legacy Fluent UI canvas demo code and dependencies have been removed to keep the starter minimal.

## Quickstart

- Install deps: `npm install` (Node 22+).
- Start local relay: `npm run start:server`.
- Run dev server: `npm run dev` (opens <http://localhost:8080> per `vite.config.mts`).
- Open a second tab/window to see live collaboration. Container ID is persisted in the URL.

If `npm run dev` fails with `Port 8080 is already in use`, either stop the process using that port or run `npm run dev -- --port 8081`.

## Forking with AI

If you plan to build your app primarily with AI assistants, follow the engineer workflow in [docs/FORKING_WITH_AI.md](docs/FORKING_WITH_AI.md).

## What’s Included

- SharedTree model: shared title + checklist items (text/done/author/timestamp).
- Presence: user list and cursors via `@fluidframework/presence` workspace.
- Semantic editing: mock LLM client that can propose list/title edits; set `VITE_LLM_ENDPOINT` to POST `{ title, items[] }` JSON and return `{ title?, items? }` to hook up a real service.
- React + Tailwind UI: single-page starter (header, presence chips, shared list, “Ask AI” button).
- Tooling: Vite + TS, Tailwind v4, Vitest/Playwright configs available, Tinylicious for local relay.

## Key Files to Modify

- Data model: `src/schema/starterSchema.ts` — add/change fields on `AppModel`, `Item`.
- Data helpers: `src/infra/sharedTreeClient.ts` — CRUD, snapshot, and mutations (uses `Tree.runTransaction`).
- Presence: `src/infra/presenceClient.ts` — users + cursor managers; extend for selections/other signals.
- Semantic: `src/infra/llmClient.ts` — mock or HTTP-backed `suggestEdit`; replace with your real API calls.
- React runtime: `src/react/contexts/FluidContext.tsx` — exposes container/tree/presence/llm/me.
- UI: `src/App.tsx` — main starter experience; add routes/components here.
- Entry: `src/start/starterStart.tsx` + `src/index.tsx` — bootstraps client, presence, and renders app.
- Config: `vite.config.mts`, `tsconfig.json`, `eslint.config.mjs`, `tailwind` via `src/index.css`.

## Data & Presence Cheat Sheet

- Container schema: `src/schema/containerSchema.ts` defines `appData: SharedTree`.
- Create/get container: `loadStarterContainer` in `src/infra/sharedTreeClient.ts` (initializes default content when empty).
- React subscription: `useSharedTreeState` in `src/react/hooks/useSharedTreeState.ts` (listens to `nodeChanged` / `treeChanged`).
- Presence workspace: `createPresenceClients` sets up `users` + `cursor` managers on workspace `workspace:starter`.
- User identity: generated locally via `unique-names-generator`; replace with auth if needed.

## Commands

- `npm run dev` — Vite dev server (defaults to local relay).
- `npm run start:server` — start Tinylicious local relay.
- `npm run compile` — typecheck/build TS.
- `npm run test:unit` — Vitest (add tests under `src` as needed).
- `npm run test` — Playwright e2e (optional; update tests to cover the starter UI).

## How to Extend (agent-friendly prompts)

- Add a new field to the shared model: update `AppModel`/`Item` in `starterSchema.ts`; expose helper in `sharedTreeClient.ts`; consume via `useSharedTreeState` in UI.
- Add a new presence signal: create a manager in `src/presence`, register it in `presenceClient.ts`, expose via context, and render in UI.
- Swap in a real LLM: implement `suggestEdit` in `llmClient.ts` to call your API; keep `applySemanticSuggestion` to map results into SharedTree mutations.
- Change styling: edit `src/index.css` (Tailwind entry) and component classNames; add tokens if needed.

## Environment

- `VITE_FLUID_CLIENT` defaults to `local`; set to `azure` to use Azure Fluid Relay (see `src/infra/azure/azureClientProps.ts`).
- Local relay: `npm run start:server` (Tinylicious). Azure requires token provider/env wiring (placeholders already present).

### Service Dependencies

- **Local (default)**: Tinylicious local Fluid service started via `npm run start:server` (no auth required).
- **Azure Fluid Relay**: Requires an Azure Fluid Relay instance and a token provider function; MSAL authentication flows are scaffolded but disabled by default.

### Auth Implementation (optional Azure path)

- **Local mode**: No authentication; users are generated with `unique-names-generator` in `start/starterStart.tsx`.
- **Azure mode (scaffolded)**:
    - Uses the same starter entry (`src/start/starterStart.tsx`) with remote connection config selected by env.
    - Fluid client uses `getClientProps` (`src/infra/azure/azureClientProps.ts`) with `AzureFunctionTokenProvider` expecting `VITE_AZURE_FUNCTION_TOKEN_PROVIDER_URL`.
    - User identity is currently generated locally; replace with your auth identity source when needed.
- To enable: set `VITE_FLUID_CLIENT=azure`, provide the Azure env vars below, and ensure your token provider function returns valid Fluid tokens.

### .env Setup

Create `.env` in the repo root (copy from `.env.defaults` if present). Key values:

```bash
# Select client: local | azure
VITE_FLUID_CLIENT=local

# Optional: external LLM endpoint (POST)
# VITE_LLM_ENDPOINT="https://your-llm-endpoint"

# Azure Fluid Relay (only when VITE_FLUID_CLIENT=azure)
VITE_AZURE_TENANT_ID="<your-tenant-id>"
VITE_AZURE_ORDERER="https://<your-orderer-host>"
VITE_AZURE_FUNCTION_TOKEN_PROVIDER_URL="https://<your-token-provider-endpoint>"

# Optional: additional auth/graph values if you wire MSAL/Graph
# VITE_AZURE_CLIENT_ID="<app-client-id>"
# VITE_AZURE_AUTHORITY="https://login.microsoftonline.com/<tenant-id>"
```

Notes:

- Local mode ignores the Azure variables and uses an insecure token provider for development.
- Azure mode expects a deployed token provider (see `src/infra/azure/azureClientProps.ts`); plug in your function URL.
- After changing env values, restart the dev server.

### Azure token provider expectations

- **Request**: HTTP `GET` to `VITE_AZURE_FUNCTION_TOKEN_PROVIDER_URL` with query params `tenantId`, `documentId`, `userName`, `userId`, `additionalDetails` (see `AzureFunctionTokenProvider` in `src/infra/azure/azureTokenProvider.ts`).
- **Response**: status 200 with the raw JWT string (no JSON wrapper). Claims should include `tenantId`, `documentId` (or empty string), `user` (id/name/additionalDetails), and scopes at least `DocRead`, `DocWrite`, `SummaryWrite`.
- **Minimal Azure Function (Node)**:

```ts
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { generateToken } from "@fluidframework/server-libraries";

const tenantId = process.env.AZURE_TENANT_ID!;
const tenantKey = process.env.AZURE_TENANT_KEY!; // from the Fluid Relay resource

const httpTrigger: AzureFunction = async (context: Context, req: HttpRequest) => {
	const {
		tenantId: queryTenant,
		documentId = "",
		userId = "anonymous",
		userName = "anonymous",
		additionalDetails,
	} = req.query;
	const jwt = generateToken(
		queryTenant ?? tenantId,
		tenantKey,
		["doc:read", "doc:write", "summary:write"],
		documentId,
		{
			id: userId,
			name: userName,
			additionalDetails,
		}
	);
	context.res = { status: 200, body: jwt };
};

export default httpTrigger;
```

- **Deploy**: Create an HTTP-triggered Azure Function, set `AZURE_TENANT_ID`/`AZURE_TENANT_KEY` app settings, enable CORS for your app origin(s), and point `VITE_AZURE_FUNCTION_TOKEN_PROVIDER_URL` to the function URL.

## Minimal Mental Model

- Shared state: `tree.root` (title + items) — persisted via SharedTree.
- Ephemeral state: presence workspace (users, cursors) — not persisted.
- React layer: subscribe via hooks, mutate via sharedTreeClient helpers inside transactions.
- URL holds `id` for the Fluid container; attach flow writes it back to the URL.

## Next Steps

- Write a Vitest for `addItem/toggleItem/applySemanticSuggestion`.
- Add a Playwright smoke: load page, see title, add item, see presence badge count across two tabs.
