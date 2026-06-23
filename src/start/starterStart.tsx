import React from "react";
import { createRoot } from "react-dom/client";
import { AzureClient } from "@fluidframework/azure-client";
import { AttachState } from "fluid-framework";
import { getClientProps } from "../infra/azure/azureClientProps.js";
import {
	getSudokuSnapshot,
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
import { fetchLeaderboard, formatElapsed, type LeaderboardEntry } from "../utils/leaderboard.js";
import { generateRoomCode, isRoomCode, parseJoinInput, resolveJoinTarget, resolveRoomCode } from "../utils/rooms.js";

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

// Mirrors PCOLORS in App.tsx so the lobby room-preview dots match in-room colors.
const PREVIEW_COLORS = [
	"#6b8cba", "#b87070", "#a8893a", "#5a9e85",
	"#8a73b5", "#b87d5a", "#5a96a8", "#a86990",
];

// Apple-style segmented control: a single "thumb" slides between slots with a
// smooth spring-like settle, instead of each slot independently fading its fill.
function Segmented<T extends string>({
	value,
	options,
	onChange,
	ariaLabel,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
	ariaLabel?: string;
}) {
	const n = options.length;
	const idx = Math.max(0, options.findIndex((o) => o.value === value));
	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			className="relative flex rounded-2xl p-1"
			style={{
				background: "rgba(0,0,0,0.04)",
				border: "1px solid rgba(0,0,0,0.04)",
			}}
		>
			<div
				aria-hidden
				className="absolute rounded-xl"
				style={{
					top: 4,
					bottom: 4,
					left: 4,
					width: `calc((100% - 8px) / ${n})`,
					transform: `translateX(${idx * 100}%)`,
					background: "rgba(255,255,255,0.85)",
					boxShadow:
						"0 1px 4px rgba(0,0,0,0.06), 0 0.5px 0 rgba(255,255,255,0.8) inset",
					transition: "transform 0.42s cubic-bezier(0.34, 1.32, 0.5, 1)",
					willChange: "transform",
				}}
			/>
			{options.map((o) => {
				const active = value === o.value;
				return (
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onChange(o.value)}
						className="relative z-10 flex-1 rounded-xl py-2 text-[13px] font-medium transition-colors duration-200"
						style={{ color: active ? P.text : P.text3 }}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

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

function StarterBootstrap() {
	const [runtime, setRuntime] = React.useState<React.ReactNode | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [joinInput, setJoinInput] = React.useState("");
	const [difficulty, setDifficulty] = React.useState<SudokuDifficulty>("easy");
	const [gameMode, setGameMode] = React.useState<"classic" | "cosudoku">("cosudoku");

	// Live preview of who's already in a room, shown as the user types/pastes a
	// join code so they get feedback before committing to join.
	type RoomPreview = {
		players: { id: string; name: string; online: boolean }[];
		gameMode: "classic" | "cosudoku";
		difficulty: SudokuDifficulty;
	};
	const [preview, setPreview] = React.useState<RoomPreview | null>(null);
	const [previewState, setPreviewState] = React.useState<"idle" | "loading" | "empty" | "error">("idle");

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
		async (containerId: string, makeAdmin: boolean, diff: SudokuDifficulty = "easy", mode: "classic" | "cosudoku" = "classic", knownCode?: string) => {
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

				// New rooms get a short 4-digit code; joiners reuse the code they
				// came in with. We keep the container id in the URL too, so a shared
				// link is self-contained and joins instantly on any device even if the
				// code lookup is unavailable. The short ?room= code is what we display
				// and what people can type by hand.
				let code = knownCode;
				if (makeAdmin) {
					try {
						code = await generateRoomCode(resolvedId);
					} catch {
						code = undefined;
					}
				}

				const next = new URL(window.location.href);
				next.searchParams.set("id", resolvedId);
				if (code) next.searchParams.set("room", code);
				else next.searchParams.delete("room");
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
		const params = new URLSearchParams(window.location.search);
		const id = params.get("id") ?? "";
		const room = params.get("room") ?? "";
		if (id) {
			// Self-contained link — join the container directly, no lookup needed.
			void launchRoom(id, false, "easy", "classic", isRoomCode(room) ? room : undefined);
		} else if (room) {
			// Code-only link — translate the code to a container id via the lookup.
			void (async () => {
				const containerId = await resolveRoomCode(room);
				if (containerId) void launchRoom(containerId, false, "easy", "classic", room);
				else setError("That room code wasn’t found.");
			})();
		}
	}, [launchRoom]);

	const [diffTab, setDiffTab] = React.useState<"easy" | "medium" | "hard">("easy");
	const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);
	React.useEffect(() => {
		let active = true;
		void fetchLeaderboard(diffTab, 10).then((rows) => {
			if (active) setLeaderboard(rows);
		});
		return () => {
			active = false;
		};
	}, [diffTab]);

	// Debounced room peek: load the container read-only, read its registered
	// players + audience (online set), then dispose. Guarded against races so a
	// stale load can't overwrite a newer query.
	React.useEffect(() => {
		const target = parseJoinInput(joinInput);
		if (target.kind === "none") {
			setPreview(null);
			setPreviewState("idle");
			return;
		}
		let cancelled = false;
		let dispose: (() => void) | null = null;
		setPreviewState("loading");
		const timer = setTimeout(() => {
			void (async () => {
				try {
					const resolved = await resolveJoinTarget(target);
					if (cancelled) return;
					if (!resolved) {
						setPreview(null);
						setPreviewState("error");
						return;
					}
					const { container, tree, audience } = await loadStarterContainer({ client, containerId: resolved.containerId });
					dispose = () => container.dispose();
					if (cancelled) { container.dispose(); return; }

					// A freshly loaded container reflects the last summary; recent ops
					// (e.g. a player registering) may still be inbound. Wait for the
					// connection, then briefly poll so we don't falsely report "empty".
					if (container.connectionState !== 2 /* Connected */) {
						await new Promise<void>((resolve) => {
							const onConnected = () => { container.off("connected", onConnected); resolve(); };
							container.on("connected", onConnected);
							setTimeout(() => { container.off("connected", onConnected); resolve(); }, 4000);
						});
					}
					if (cancelled) { container.dispose(); return; }

					const read = () => {
						const snap = getSudokuSnapshot(tree);
						const members = audience.getMembers();
						return {
							players: snap.players.map((p) => ({ id: p.id, name: p.name, online: members.has(p.id) })),
							gameMode: snap.gameMode,
							difficulty: snap.difficulty,
						};
					};
					let result = read();
					for (let i = 0; i < 6 && result.players.length === 0; i++) {
						await new Promise((r) => setTimeout(r, 250));
						if (cancelled) { container.dispose(); return; }
						result = read();
					}
					if (cancelled) { container.dispose(); return; }
					setPreview(result);
					setPreviewState(result.players.length === 0 ? "empty" : "idle");
				} catch {
					if (!cancelled) {
						setPreview(null);
						setPreviewState("error");
					}
				}
			})();
		}, 550);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			if (dispose) dispose();
		};
	}, [joinInput, client]);

	if (runtime) return runtime;

	const joinTarget = parseJoinInput(joinInput);
	const canJoin = joinTarget.kind !== "none";

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
			<div className="relative flex flex-col items-center overflow-hidden" style={{ height: "100vh", scrollSnapAlign: "start" }}>
				<div className="flex-1 w-full overflow-y-auto flex flex-col px-5 pt-8 pb-4">
				<div className="w-full max-w-[360px] mx-auto my-auto flex flex-col gap-4">

				{/* Brand */}
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight" style={{ color: P.text, letterSpacing: "-0.02em" }}>
						Co-Sudoku
					</h1>
					<p className="mt-1.5 text-[13px]" style={{ color: P.text3 }}>
						sudoku, but make it a group activity ✦ play with friends
					</p>
				</div>

				{/* Create */}
				<div
					className="rounded-3xl p-5 flex flex-col gap-4"
					style={{
						background: P.glassBold,
						backdropFilter: "blur(32px) saturate(1.5)",
						WebkitBackdropFilter: "blur(32px) saturate(1.5)",
						border: `1px solid ${P.glassBorder}`,
						boxShadow: "0 4px 24px rgba(80,60,30,0.06), 0 0.5px 0 rgba(255,255,255,0.6) inset",
					}}
				>
					<p className="text-[15px] font-semibold tracking-tight" style={{ color: P.text }}>
						Create a room
					</p>

					<div className="flex flex-col gap-1.5">
						<label
							className="text-[10px] font-bold uppercase tracking-[0.12em]"
							style={{ color: P.text3 }}
						>
							Difficulty
						</label>
						<Segmented
							ariaLabel="Difficulty"
							value={difficulty}
							onChange={setDifficulty}
							options={[
								{ value: "easy", label: "Easy" },
								{ value: "medium", label: "Medium" },
								{ value: "hard", label: "Hard" },
							]}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							className="text-[10px] font-bold uppercase tracking-[0.12em]"
							style={{ color: P.text3 }}
						>
							Mode
						</label>
						<Segmented
							ariaLabel="Mode"
							value={gameMode}
							onChange={setGameMode}
							options={[
								{ value: "cosudoku", label: "Classic" },
								{ value: "classic", label: "Turn-Based" },
							]}
						/>
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
					className="rounded-3xl p-5 flex flex-col gap-4"
					style={{
						background: P.glass,
						backdropFilter: "blur(24px) saturate(1.4)",
						WebkitBackdropFilter: "blur(24px) saturate(1.4)",
						border: `1px solid ${P.glassBorder}`,
						boxShadow: "0 2px 16px rgba(80,60,30,0.04), 0 0.5px 0 rgba(255,255,255,0.5) inset",
					}}
				>
					<p className="text-[15px] font-semibold tracking-tight" style={{ color: P.text }}>
						Join a room
					</p>

					<form
						onSubmit={(e) => {
							e.preventDefault();
							if (busy || !canJoin) return;
							void (async () => {
								const resolved = await resolveJoinTarget(joinTarget);
								if (!resolved) {
									setError("That room code wasn’t found.");
									return;
								}
								await launchRoom(resolved.containerId, false, "easy", "classic", resolved.code);
							})();
						}}
						className="relative"
					>
						<input
							value={joinInput}
							onChange={(e) => setJoinInput(e.target.value)}
							placeholder="Room code or URL"
							enterKeyHint="go"
							inputMode="text"
							className="w-full rounded-2xl pl-4 pr-14 py-3 text-sm outline-none transition-all duration-200"
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
							type="submit"
							disabled={busy || !canJoin}
							aria-label={busy ? "Joining" : "Join room"}
							className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-0 disabled:pointer-events-none"
							style={{
								width: 38,
								height: 38,
								background: P.accent,
								color: "#fff",
								boxShadow: "0 2px 8px rgba(120,90,40,0.25)",
							}}
						>
							{busy ? (
								<span className="text-base leading-none">…</span>
							) : (
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
									<line x1="5" y1="12" x2="19" y2="12" />
									<polyline points="12 5 19 12 12 19" />
								</svg>
							)}
						</button>
					</form>

					{/* Live room preview — auto-shows who's already in the room as you type */}
					<div
						className="overflow-hidden transition-all duration-300 ease-out"
						style={{
							maxHeight: previewState === "idle" && preview && preview.players.length > 0 ? 200
								: previewState === "loading" || previewState === "empty" || previewState === "error" ? 44
								: 0,
							opacity: previewState === "idle" && !(preview && preview.players.length > 0) ? 0 : 1,
						}}
					>
						<div className="pt-3">
							{previewState === "loading" && (
								<div className="flex items-center gap-2 text-[12px]" style={{ color: P.text3 }}>
									<span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(0,0,0,0.12)", borderTopColor: P.accent }} />
									<span>Looking for the room…</span>
								</div>
							)}
							{previewState === "error" && (
								<p className="text-[12px]" style={{ color: P.text3 }}>
									No room found for that code yet.
								</p>
							)}
							{previewState === "empty" && (
								<p className="text-[12px]" style={{ color: P.text3 }}>
									Room is open — you’ll be the first one in.
								</p>
							)}
							{previewState === "idle" && preview && preview.players.length > 0 && (
								<div>
									<div className="flex items-center justify-between mb-2">
										<span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: P.text3 }}>
											In this room
										</span>
										<span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: P.text3 }}>
											{preview.gameMode === "cosudoku" ? "Classic" : "Turn-Based"} · {preview.difficulty}
										</span>
									</div>
									<div className="flex flex-wrap gap-1.5">
										{preview.players.map((p, i) => {
											const color = PREVIEW_COLORS[i % PREVIEW_COLORS.length];
											return (
												<div
													key={p.id}
													className="flex items-center gap-1.5 rounded-full pl-1.5 pr-2.5 py-1"
													style={{ background: "rgba(0,0,0,0.03)" }}
												>
													<span className="relative flex items-center justify-center w-2.5 h-2.5">
														<span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}40` }} />
														{p.online && (
															<span className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "#5a9e85", border: "1.5px solid #f8f3eb" }} />
														)}
													</span>
													<span className="text-[12px] leading-none whitespace-nowrap" style={{ color: P.text2, fontWeight: 500 }}>
														{p.name}
													</span>
												</div>
											);
										})}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				{error && (
					<p className="text-[12px] text-center font-medium" style={{ color: "#b85450" }}>
						{error}
					</p>
				)}
			</div>
			</div>

			{/* Bottom chrome — a dedicated safe area in the layout flow so the
			    scroll hint and credit can never overlap the content above. */}
			<div className="relative w-full shrink-0 h-16">
				<div className="absolute bottom-4 left-6 flex flex-col items-start gap-0.5 animate-bounce pointer-events-none" style={{ color: P.text3 }}>
					<span className="text-[11px] font-medium tracking-wide">Leaderboard</span>
					<span className="text-[14px] leading-none">↓</span>
				</div>
				<p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-medium select-none pointer-events-none whitespace-nowrap" style={{ color: P.text3 }}>
					created by aimee leong
				</p>
			</div>
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
