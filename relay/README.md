# Tinylicious Fluid relay (Fly.io)

This folder deploys a [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious)
instance — the lightweight Fluid Framework relay — so the app can run collaborative
rooms online (the frontend on Vercel connects to it over `wss://`).

It is pinned to **tinylicious@7.0.0** to match the version used in local dev and to
stay compatible with `@fluidframework/azure-client` in the app.

## What it is / isn't

- ✅ Always-on WebSocket relay for live game state (board, turns, presence).
- ⚠️ **Ephemeral** — Tinylicious keeps room state in memory. If this process
  restarts (redeploy, crash, host maintenance) all *in-progress* rooms are lost.
  The leaderboard is unaffected (it lives in Supabase via `/api/leaderboard`).
- ⚠️ Insecure dev-grade auth (anyone with a room id can join). Fine for a
  friends-only game behind unguessable share links.

## Deploy

Requires a [Fly.io](https://fly.io) account and `flyctl`.

```bash
cd relay
fly auth login                  # or: fly auth token / FLY_API_TOKEN
fly launch --copy-config --name <your-unique-app-name> --region sjc --now
```

After it deploys, note the URL (e.g. `https://<app>.fly.dev`) and point the app at it:

```bash
# In the Vercel project env (Production):
VITE_FLUID_CLIENT=local
VITE_TINYLICIOUS_ENDPOINT=https://<app>.fly.dev
```

Then redeploy the frontend so the bundle bakes in the relay URL instead of
`http://localhost:7070`.

## Redeploy the relay

```bash
cd relay
fly deploy
```

Avoid redeploying while friends are mid-game — it restarts the process and clears
active rooms.
