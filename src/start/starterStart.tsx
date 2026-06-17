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
	bg:        "#f8f5f0",
	card:      "#ffffff",
	subtle:    "#f3efe8",
	border:    "#e5ddd4",
	text:      "#1a1510",
	text2:     "#706055",
	text3:     "#a89888",
	accent:    "#526d8a",
	accentHov: "#3e5670",
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

	const client = React.useMemo(() => new AzureClient(getClientProps()), []);
	const me = React.useMemo(() => makeUser(), []);

	const launchRoom = React.useCallback(
		async (containerId: string, makeAdmin: boolean, diff: SudokuDifficulty = "easy") => {
			setBusy(true);
			setError(null);
			try {
				const { container, tree } = await loadStarterContainer({ client, containerId });
				if (makeAdmin) {
					initializeRoomAdmin(tree, { id: me.id, name: me.name });
					initializeGeneratedSudokuRoom(tree, diff);
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
			className="min-h-screen flex items-center justify-center px-4 py-12"
			style={{
				background: P.bg,
				fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
			}}
		>
			<div className="w-full max-w-[340px] flex flex-col gap-5">

				{/* Brand */}
				<div>
					<h1 className="text-xl font-semibold" style={{ color: P.text }}>
						Collaborative Sudoku
					</h1>
					<p className="mt-1 text-sm" style={{ color: P.text3 }}>
						Take turns placing one number at a time.
					</p>
				</div>

				{/* Create */}
				<div
					className="rounded-2xl p-5 flex flex-col gap-4"
					style={{
						background: P.card,
						border: `1px solid ${P.border}`,
						boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
					}}
				>
					<div>
						<p className="text-sm font-semibold" style={{ color: P.text }}>
							Create a room
						</p>
						<p className="mt-0.5 text-xs" style={{ color: P.text3 }}>
							Share the link — others can jump in.
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="difficulty"
							className="text-[11px] font-semibold uppercase tracking-wider"
							style={{ color: P.text3 }}
						>
							Difficulty
						</label>
						<select
							id="difficulty"
							value={difficulty}
							onChange={(e) => setDifficulty(e.target.value as SudokuDifficulty)}
							className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
							style={{
								background: P.subtle,
								border: `1px solid ${P.border}`,
								color: P.text,
							}}
						>
							<option value="easy">Easy</option>
							<option value="medium">Medium</option>
							<option value="hard">Hard</option>
						</select>
					</div>

					<button
						type="button"
						disabled={busy}
						onClick={() => void launchRoom("", true, difficulty)}
						className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-40"
						style={{ background: P.accent }}
						onMouseOver={(e) => { if (!busy) e.currentTarget.style.background = P.accentHov; }}
						onMouseOut={(e)  => { e.currentTarget.style.background = P.accent; }}
					>
						{busy ? "Creating…" : "Create room"}
					</button>
				</div>

				{/* Join */}
				<div
					className="rounded-2xl p-5 flex flex-col gap-4"
					style={{
						background: P.card,
						border: `1px solid ${P.border}`,
						boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
					}}
				>
					<div>
						<p className="text-sm font-semibold" style={{ color: P.text }}>
							Join a room
						</p>
						<p className="mt-0.5 text-xs" style={{ color: P.text3 }}>
							Paste a room link or ID.
						</p>
					</div>

					<input
						value={joinInput}
						onChange={(e) => setJoinInput(e.target.value)}
						placeholder="Paste URL or room ID"
						className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition"
						style={{
							background: P.subtle,
							border: `1px solid ${P.border}`,
							color: P.text,
						}}
						onFocus={(e) => { e.currentTarget.style.borderColor = P.accent; }}
						onBlur={(e)  => { e.currentTarget.style.borderColor = P.border; }}
					/>

					<button
						type="button"
						disabled={busy || joinId.length === 0}
						onClick={() => void launchRoom(joinId, false)}
						className="w-full rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-40"
						style={{
							background: P.card,
							border: `1px solid ${P.border}`,
							color: P.text2,
						}}
					>
						{busy ? "Joining…" : "Join room"}
					</button>
				</div>

				{error && (
					<p className="text-xs text-center" style={{ color: "#b85450" }}>
						{error}
					</p>
				)}

				<p className="text-center text-xs" style={{ color: P.text3 }}>
					created by aimee leong
				</p>
			</div>
		</div>
	);
}
