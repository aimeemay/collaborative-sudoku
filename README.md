# 🔢 Collaborative Sudoku

The first ever collaborative Sudoku. Play with friends — solve together, pick up points (and friends) along the way. ✨

## 💡 About

Collaborative Sudoku is a real-time multiplayer puzzle game built on [Microsoft Fluid Framework](https://fluidframework.com/) — the same technology that powers live co-editing in Microsoft 365. Every cell tap, number entry, and player move is instantly synced across everyone in the room, with no refresh and no lag.

Under the hood it uses Fluid's shared data structures to keep the board in perfect sync, React for the UI, and Tailwind for styling. Real-time presence shows who's playing, cell locking prevents collisions, and the shared game state means everyone is always looking at the same puzzle.

## 🎮 How To Play

1. **Create a room** — give yourself a name, choose a difficulty, pick a mode
2. **Share the room ID** — friends join by entering it on the home screen
3. **CoSudoku mode** — everyone plays simultaneously; click to lock a cell, type your number, hit Submit (or `⌘↵`)
4. **Turn-based mode** — take turns placing numbers; the board enforces whose go it is

## 🏆 How To Win

We win together — fill the board correctly and everyone scores. Points accumulate as cells are solved.

## 🚀 Quickstart

```bash
npm install          # Node 22+
npm run start:local  # starts Tinylicious relay + Vite dev server together
```

Open <http://localhost:8080>, create a room, then open a second tab and join with the same room ID to see live collaboration.

If port 8080 is in use: `npm run dev -- --port 8081`

## 🛠 Commands

- `npm run start:local` — run Tinylicious relay + Vite together (recommended)
- `npm run dev` — Vite only (needs relay running separately)
- `npm run start:server` — Tinylicious relay only
- `npm run compile` — typecheck
- `npm run test:unit` — Vitest unit tests
- `npm run test` — Playwright e2e

## 📁 Key Files

- `src/schema/starterSchema.ts` — shared data model (board, players, game state)
- `src/infra/sharedTreeClient.ts` — all game mutations (cell submit, admin, room management)
- `src/infra/presenceClient.ts` — live player list and cursor presence
- `src/App.tsx` — main game UI
- `src/start/starterStart.tsx` — lobby / room create+join screen

## 🤝 Contributing

Every commit to `main` automatically asks Copilot to review and update this README. So just ship — the docs keep up. 🎲

## 💛 Made by

[Aimee Leong](https://github.com/aimeemay)