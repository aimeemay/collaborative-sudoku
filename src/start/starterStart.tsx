import React from "react";
import { createRoot } from "react-dom/client";
import { AzureClient } from "@fluidframework/azure-client";
import { AttachState } from "fluid-framework";
import { getClientProps } from "../infra/azure/azureClientProps.js";
import {
	initializeGeneratedSudokuRoom,
	initializeRoomAdmin,
	loadStarterContainer,
} from "../infra/sharedTreeClient.js";
import { createPresenceClients, PresenceUser } from "../infra/presenceClient.js";
import { createLlmClient } from "../infra/llmClient.js";
import { FluidProvider } from "../react/contexts/FluidContext.js";
import { StarterApp } from "../App.js";
import type { SudokuDifficulty } from "../utils/sudokuGenerator.js";
import { adjectives, animals, colors, uniqueNamesGenerator } from "unique-names-generator";
import { getLeaderboard, formatElapsed, type LeaderboardEntry } from "../utils/leaderboard.js";

const P = {
	bgFrom:    "#f5f0e8",
	bgVia:     "#f8f3eb",
	bgTo:      "#f2ede4",
	glass:     "rgba(255,252,247,0.55)",
	glassBold: "rgba(255,252,247,0.72)",
	glassBorder: "rgba(220,210,195,0.45)",
	text:      "#2c2418",
	text2:     "#7a6b58",
	text3:     "#b0a290",
	accent:    "#8b7355",
	accentSoft: "rgba(139,115,85,0.10)",
} as const;

function makeUser(): PresenceUser {
	const KEY = "sudoku.me";
	// Persist identity per-tab so a reload keeps the same id (admin stays admin,
	// scores survive a refresh, and the Fluid audience sees a reconnect rather
	// than a fresh player). sessionStorage is per-tab, so two tabs in the same
	// browser still get distinct identities.
	try {
		const saved = sessionStorage.getItem(KEY);
		if (saved) {
			const parsed = JSON.parse(saved) as Partial<PresenceUser>;
			if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") {
				return { id: parsed.id, name: parsed.name };
			}
		}
	} catch {
		/* ignore storage/parse errors and fall through to a fresh identity */
	}
	const name = uniqueNamesGenerator({ dictionaries: [adjectives, colors, animals], length: 2 });
	const user: PresenceUser = { id: crypto.randomUUID(), name };
	try {
		sessionStorage.setItem(KEY, JSON.stringify(user));
	} catch {
		/* ignore storage errors */
	}
	return user;
}

export async function startStarter() {
	const host = document.getElementById("root");
	if (!host) throw new Error("Root element '#root' not found");
	const root = createRoot(host);
	root.render(
		<React.StrictMode>
			<StarterBootstrap />
		</React.StrictMode>
	);
}

function extractContainerId(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";
	try {
		const url = new URL(trimmed);
		return url.searchParams.get("id") ?? "";
	} catch {
		return trimmed;
	}
}

function StarterBootstrap() {
	const [runtime, setRuntime] = React.useState<React.ReactNode | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [joinInput, setJoinInput] = React.useState("");
	const [difficulty, setDifficulty] = React.useState<SudokuDifficulty>("easy");
	const [gameMode, setGameMode] = React.useState<"classic" | "cosudoku">("cosudoku");

	const meRef = React.useRef<PresenceUser | null>(null);
	if (!meRef.current) meRef.current = makeUser();
	const me = meRef.current;

	// Connect to Fluid using the app's player identity so the relay audience keys
	// members by the same id the game uses — letting us track joins/leaves reliably.
	const client = React.useMemo(
		() => new AzureClient(getClientProps({ id: me.id, name: me.name, image: "" })),
		[me.id, me.name]
	);

	const launchRoom = React.useCallback(
		async (containerId: string, makeAdmin: boolean, diff: SudokuDifficulty = "easy", mode: "classic" | "cosudoku" = "classic") => {
			setBusy(true);
			setError(null);
			try {
				const { container, tree, audience } = await loadStarterContainer({ client, containerId });
				if (makeAdmin) {
					initializeRoomAdmin(tree, { id: me.id, name: me.name });
					initializeGeneratedSudokuRoom(tree, diff, mode);
				}

				let resolvedId = containerId;
				if (container.attachState === AttachState.Detached) {
					resolvedId = await container.attach();
				}

				const next = new URL(window.location.href);
				next.searchParams.set("id", resolvedId);
				window.history.replaceState({}, "", next.toString());

				const presence = createPresenceClients(container, me);
				const llm = createLlmClient();
				setRuntime(
					<FluidProvider value={{ container, tree, presence, llm, me, audience }}>
						<StarterApp />
					</FluidProvider>
				);
			} catch (err) {
				console.error("Room launch failed", err);
				setError("Could not open room. Check the link and try again.");
			} finally {
				setBusy(false);
			}
		},
		[client, me]
	);

	React.useEffect(() => {
		const id = new URLSearchParams(window.location.search).get("id") ?? "";
		if (id) void launchRoom(id, false);
	}, [launchRoom]);

	const [allEntries] = React.useState<LeaderboardEntry[]>(() => getLeaderboard());
	const [diffTab, setDiffTab] = React.useState<"easy" | "medium" | "hard">("easy");
	const leaderboard = allEntries.filter(e => e.difficulty === diffTab).slice(0, 10);

	if (runtime) return runtime;

	const joinId = extractContainerId(joinInput);

	const MEDAL = ["🥇", "🥈", "🥉"];
	const MEDAL_BG = [
		"rgba(240,179,64,0.10)",   // gold
		"rgba(180,180,180,0.10)",  // silver
		"rgba(184,128,80,0.10)",   // bronze
	];
	const MEDAL_BORDER = [
		"rgba(240,179,64,0.25)",
		"rgba(180,180,180,0.22)",
		"rgba(184,128,80,0.22)",
	];
	const MEDAL_TIME_COLOR = ["#c89a28", "#888", "#a0714a"];

	return (
		<div
			style={{
				background: `linear-gradient(135deg, ${P.bgFrom} 0%, ${P.bgVia} 50%, ${P.bgTo} 100%)`,
				fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
				height: "100vh",
				overflowY: "scroll",
				scrollSnapType: "y mandatory",
			}}
		>
			{/* ── Hero page ────────────────────────────────────────────── */}
			<div className="relative flex flex-col items-center px-4 py-12 overflow-hidden" style={{ height: "100vh", scrollSnapAlign: "start" }}>
				<div className="flex-1 flex items-center justify-center w-full">
				<div className="w-full max-w-[360px] flex flex-col gap-5">

				{/* Brand */}
				<div className="text-center">
					<h1 className="text-xl font-bold tracking-tight" style={{ color: P.text, letterSpacing: "-0.02em" }}>
						Collaborative Sudoku
					</h1>
					<p className="mt-1 text-[13px]" style={{ color: P.text3 }}>
						sudoku, but make it a group activity ✦ play with friends
					</p>
				</div>

				{/* Create */}
				<div
					className="rounded-3xl p-6 flex flex-col gap-4"
					style={{
						background: P.glassBold,
						backdropFilter: "blur(32px) saturate(1.5)",
						WebkitBackdropFilter: "blur(32px) saturate(1.5)",
						border: `1px solid ${P.glassBorder}`,
						boxShadow: "0 4px 24px rgba(80,60,30,0.06), 0 0.5px 0 rgba(255,255,255,0.6) inset",
					}}
				>
					<div>
						<p className="text-sm font-semibold" style={{ color: P.text }}>
							Create a room
						</p>
						<p className="mt-0.5 text-[12px]" style={{ color: P.text3 }}>
							Share the link — others can jump in.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							className="text-[10px] font-bold uppercase tracking-[0.12em]"
							style={{ color: P.text3 }}
						>
							Difficulty
						</label>
						<div
							className="flex rounded-2xl p-1"
							style={{
								background: "rgba(0,0,0,0.04)",
								border: "1px solid rgba(0,0,0,0.04)",
							}}
						>
							{(["easy", "medium", "hard"] as const).map((d) => (
								<button
									key={d}
									type="button"
									onClick={() => setDifficulty(d)}
									className="flex-1 rounded-xl py-2 text-[13px] font-medium transition-all duration-200"
									style={{
										background: difficulty === d ? "rgba(255,255,255,0.85)" : "transparent",
										color: difficulty === d ? P.text : P.text3,
										boxShadow: difficulty === d
											? "0 1px 4px rgba(0,0,0,0.06), 0 0.5px 0 rgba(255,255,255,0.8) inset"
											: "none",
									}}
								>
									{d.charAt(0).toUpperCase() + d.slice(1)}
								</button>
							))}
						</div>
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							className="text-[10px] font-bold uppercase tracking-[0.12em]"
							style={{ color: P.text3 }}
						>
							Mode
						</label>
						<div
							className="flex rounded-2xl p-1"
							style={{
								background: "rgba(0,0,0,0.04)",
								border: "1px solid rgba(0,0,0,0.04)",
							}}
						>
							{([["cosudoku", "Classic"], ["classic", "Turn-Based"]] as const).map(([m, label]) => (
								<button
									key={m}
									type="button"
									onClick={() => setGameMode(m)}
									className="flex-1 rounded-xl py-2 text-[13px] font-medium transition-all duration-200"
									style={{
										background: gameMode === m ? "rgba(255,255,255,0.85)" : "transparent",
										color: gameMode === m ? P.text : P.text3,
										boxShadow: gameMode === m
											? "0 1px 4px rgba(0,0,0,0.06), 0 0.5px 0 rgba(255,255,255,0.8) inset"
											: "none",
									}}
								>
									{label}
								</button>
							))}
						</div>
						{gameMode === "cosudoku" && (
							<p className="text-[11px] mt-0.5" style={{ color: P.text3 }}>
								All players solve puzzle collaboratively, live.
							</p>
						)}
						{gameMode === "classic" && (
							<p className="text-[11px] mt-0.5" style={{ color: P.text3 }}>
								Take turns placing one number at a time.
							</p>
						)}
					</div>

					<button
						type="button"
						disabled={busy}
						onClick={() => void launchRoom("", true, difficulty, gameMode)}
						className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-35"
						style={{
							background: `linear-gradient(135deg, ${P.accent}, #a08665)`,
							boxShadow: "0 2px 12px rgba(139,115,85,0.3), 0 0.5px 0 rgba(255,255,255,0.15) inset",
						}}
					>
						{busy ? "Creating…" : "Create Room"}
					</button>
				</div>

				{/* Divider */}
				<div className="flex items-center gap-3">
					<div className="flex-1" style={{ height: 1, background: P.glassBorder }} />
					<span className="text-[11px] font-medium" style={{ color: P.text3 }}>or</span>
					<div className="flex-1" style={{ height: 1, background: P.glassBorder }} />
				</div>

				{/* Join */}
				<div
					className="rounded-3xl p-6 flex flex-col gap-4"
					style={{
						background: P.glass,
						backdropFilter: "blur(24px) saturate(1.4)",
						WebkitBackdropFilter: "blur(24px) saturate(1.4)",
						border: `1px solid ${P.glassBorder}`,
						boxShadow: "0 2px 16px rgba(80,60,30,0.04), 0 0.5px 0 rgba(255,255,255,0.5) inset",
					}}
				>
					<div>
						<p className="text-sm font-semibold" style={{ color: P.text }}>
							Join a room
						</p>
						<p className="mt-0.5 text-[12px]" style={{ color: P.text3 }}>
							Paste a room code or link from a friend.
						</p>
					</div>

					<input
						value={joinInput}
						onChange={(e) => setJoinInput(e.target.value)}
						placeholder="Room code or URL"
						className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all duration-200"
						style={{
							background: "rgba(255,255,255,0.6)",
							border: "1.5px solid rgba(0,0,0,0.06)",
							color: P.text,
							boxShadow: "0 1px 4px rgba(0,0,0,0.03) inset",
						}}
						onFocus={(e) => {
							e.currentTarget.style.borderColor = P.accent;
							e.currentTarget.style.boxShadow = `0 0 0 3px ${P.accentSoft}`;
						}}
						onBlur={(e) => {
							e.currentTarget.style.borderColor = "rgba(0,0,0,0.06)";
							e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.03) inset";
						}}
					/>

					<button
						type="button"
						disabled={busy || joinId.length === 0}
						onClick={() => void launchRoom(joinId, false)}
						className="w-full rounded-2xl py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-35"
						style={{
							background: "rgba(255,255,255,0.6)",
							border: `1.5px solid ${P.glassBorder}`,
							color: P.text2,
						}}
					>
						{busy ? "Joining…" : "Join Room"}
					</button>
				</div>

				{error && (
					<p className="text-[12px] text-center font-medium" style={{ color: "#b85450" }}>
						{error}
					</p>
				)}
			</div>
			</div>

			{/* Scroll-down hint — pinned to bottom of hero viewport */}
			<div className="absolute bottom-6 left-6 flex flex-col items-start gap-1 animate-bounce pointer-events-none" style={{ color: P.text3 }}>
				<span className="text-[11px] font-medium tracking-wide">Leaderboard</span>
				<span className="text-[14px]">↓</span>
			</div>

			{/* Hero page footer */}
			<p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-medium select-none pointer-events-none" style={{ color: P.text3 }}>
				created by aimee leong
			</p>
		</div>

		{/* ── Leaderboard page ─────────────────────────────────────── */}
		<div className="relative flex flex-col items-center px-4 pt-16 pb-10 overflow-y-auto" style={{ height: "100vh", scrollSnapAlign: "start" }}>

			{/* Back nudge — top left */}
			<div className="absolute top-6 left-6 flex flex-col items-start gap-1 animate-bounce pointer-events-none" style={{ color: P.text3 }}>
				<span className="text-[14px]">↑</span>
				<span className="text-[11px] font-medium tracking-wide">Play Sudoku</span>
			</div>

			<div className="w-full max-w-[440px] flex-1">
				<div className="text-center mb-8">
					<h2 className="text-xl font-bold tracking-tight" style={{ color: P.text, letterSpacing: "-0.02em" }}>
						All-Time Best
					</h2>
				</div>

				{/* Difficulty tabs — floating text style */}
				<div className="flex justify-center gap-6 mb-6">
					{(["easy", "medium", "hard"] as const).map(d => (
						<button
							key={d}
							onClick={() => setDiffTab(d)}
							className="text-[13px] font-medium transition-all duration-150 bg-transparent border-none p-0"
							style={{
								color: diffTab === d ? P.text : P.text3,
								fontWeight: diffTab === d ? 600 : 400,
								borderBottom: diffTab === d ? `1.5px solid ${P.text}` : "1.5px solid transparent",
								paddingBottom: "2px",
							}}
						>
							{d.charAt(0).toUpperCase() + d.slice(1)}
						</button>
					))}
				</div>

				{leaderboard.length === 0 ? (
					<div className="text-center py-16" style={{ color: P.text3 }}>
						<p className="text-[32px] mb-3">🏆</p>
						<p className="text-[14px] font-medium">No {diffTab} games yet</p>
						<p className="text-[12px] mt-1 opacity-70">Complete a puzzle to set the first record!</p>
					</div>
				) : (
					<ol className="flex flex-col gap-3">
						{leaderboard.map((entry, i) => {
							const isMedal = i < 3;
							return (
								<li
									key={entry.id}
									className="rounded-2xl px-5 py-4"
									style={{
										background: isMedal ? MEDAL_BG[i] : "rgba(255,252,247,0.55)",
										border: `1px solid ${isMedal ? MEDAL_BORDER[i] : P.glassBorder}`,
										backdropFilter: "blur(16px)",
									}}
								>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-3 min-w-0">
											<span className="text-[18px] shrink-0 w-7 text-center">
												{isMedal ? MEDAL[i] : <span className="text-[13px]" style={{ color: P.text3 }}>{i + 1}</span>}
											</span>
											<div className="min-w-0">
												<p className="text-[13px] font-medium truncate" style={{ color: P.text }}>
													{entry.players.length > 0 ? entry.players.join(" · ") : "Anonymous"}
												</p>
												<p className="text-[11px] mt-0.5" style={{ color: P.text3 }}>
													{new Date(entry.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
												</p>
											</div>
										</div>
										<span
											className="text-[18px] font-bold tabular-nums shrink-0"
											style={{ color: isMedal ? MEDAL_TIME_COLOR[i] : P.accent, letterSpacing: "-0.02em" }}
										>
											{formatElapsed(entry.elapsedMs)}
										</span>
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</div>

			<p className="mt-10 text-[11px] font-medium select-none pointer-events-none" style={{ color: P.text3 }}>
				created by aimee leong
			</p>
		</div>
		</div>
	);
	}
