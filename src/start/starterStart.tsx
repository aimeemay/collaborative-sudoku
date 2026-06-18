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
	const name = uniqueNamesGenerator({ dictionaries: [adjectives, colors, animals], length: 2 });
	return { id: crypto.randomUUID(), name };
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

	const client = React.useMemo(() => new AzureClient(getClientProps()), []);
	const meRef = React.useRef<PresenceUser | null>(null);
	if (!meRef.current) meRef.current = makeUser();
	const me = meRef.current;

	const launchRoom = React.useCallback(
		async (containerId: string, makeAdmin: boolean, diff: SudokuDifficulty = "easy", mode: "classic" | "cosudoku" = "classic") => {
			setBusy(true);
			setError(null);
			try {
				const { container, tree } = await loadStarterContainer({ client, containerId });
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
					<FluidProvider value={{ container, tree, presence, llm, me }}>
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

	if (runtime) return runtime;

	const joinId = extractContainerId(joinInput);

	return (
		<div
			className="min-h-screen flex flex-col items-center px-4 py-12"
			style={{
				background: `linear-gradient(135deg, ${P.bgFrom} 0%, ${P.bgVia} 50%, ${P.bgTo} 100%)`,
				fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
			}}
		>
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
							{([["cosudoku", "CoSudoku"], ["classic", "Turn-Based"]] as const).map(([m, label]) => (
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
								All players solve simultaneously — no turns.
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

			<p className="text-center text-[11px] font-medium pb-2" style={{ color: P.text3 }}>
				created by aimee leong
			</p>
		</div>
	);
}
