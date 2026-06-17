import React from "react";
import { useFluidRuntime } from "./react/contexts/FluidContext.js";
import { useSharedTreeState } from "./react/hooks/useSharedTreeState.js";
import {
	getSudokuSnapshot,
	kickSudokuPlayer,
	registerSudokuPlayer,
	submitSudokuMoveAndPassTurn,
	passSudokuTurn,
} from "./infra/sharedTreeClient.js";
import { usePresenceUsers } from "./infra/presenceClient.js";
import type { AppModel } from "./schema/starterSchema.js";

// ─── Palette ───────────────────────────────────────────────────────────────

const P = {
	bg:           "#f8f5f0",
	card:         "#ffffff",
	subtle:       "#f3efe8",
	border:       "#e5ddd4",
	borderMid:    "#cfc4b8",
	text:         "#1a1510",
	text2:        "#706055",
	text3:        "#a89888",
	accent:       "#526d8a",
	accentHover:  "#3e5670",
	accentLight:  "#ecf1f7",
	accentBorder: "#baccde",
} as const;

const PCOLORS = ["#526d8a", "#7a608a", "#4a7a5a", "#8a7050", "#8a4f50", "#4a7a8a"];
const pc = (i: number) => PCOLORS[i % PCOLORS.length];

// ─── Name Picker ───────────────────────────────────────────────────────────

function NamePickerOverlay({
	defaultName,
	onJoin,
}: {
	defaultName: string;
	onJoin: (name: string) => void;
}) {
	const [name, setName] = React.useState(defaultName);

	return (
		<div
			className="min-h-screen flex items-center justify-center px-4"
			style={{ background: P.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}
		>
			<div className="w-full max-w-[320px] flex flex-col gap-4">
				<div>
					<h1 className="text-lg font-semibold" style={{ color: P.text }}>
						Collaborative Sudoku
					</h1>
					<p className="mt-0.5 text-sm" style={{ color: P.text3 }}>
						Pick a name to join the game
					</p>
				</div>
				<div
					className="rounded-2xl p-5"
					style={{ background: P.card, border: `1px solid ${P.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
				>
					<form
						onSubmit={(e) => { e.preventDefault(); const t = name.trim(); if (t) onJoin(t); }}
						className="flex flex-col gap-3"
					>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
							placeholder="Your name"
							className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
							style={{ background: P.subtle, border: `1px solid ${P.border}`, color: P.text }}
							onFocus={(e) => { e.currentTarget.style.borderColor = P.accent; }}
							onBlur={(e)  => { e.currentTarget.style.borderColor = P.border; }}
						/>
						<button
							type="submit"
							disabled={!name.trim()}
							className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-40"
							style={{ background: P.accent }}
						>
							Join →
						</button>
					</form>
				</div>
				<p className="text-center text-xs" style={{ color: P.text3 }}>
					created by aimee leong
				</p>
			</div>
		</div>
	);
}

// ─── Main App ──────────────────────────────────────────────────────────────

export function StarterApp() {
	const { tree, presence, me } = useFluidRuntime();
	const root = tree.root as AppModel;
	const snapshot = useSharedTreeState(
		root,
		React.useCallback(() => getSudokuSnapshot(tree), [tree]),
		"treeChanged"
	);

	// ── ALL hooks must come before any early return ────────────────────────

	const [displayName, setDisplayName] = React.useState<string | null>(null);
	const [selectedCellIndex, setSelectedCellIndex] = React.useState<number | null>(null);
	const [pendingMove, setPendingMove] = React.useState<{ cellIndex: number; value: number } | null>(null);
	const [localMessage, setLocalMessage] = React.useState<string | null>(null);

	const users = usePresenceUsers(presence.users);

	React.useEffect(() => {
		if (!displayName) return;
		registerSudokuPlayer(tree, me.id, displayName);
	}, [tree, me.id, displayName]);

	React.useEffect(() => {
		if (!localMessage) return;
		const t = setTimeout(() => setLocalMessage(null), 4000);
		return () => clearTimeout(t);
	}, [localMessage]);

	const playerIndexMap = React.useMemo(() => {
		const m = new Map<string, number>();
		snapshot.players.forEach((p, i) => m.set(p.id, i));
		return m;
	}, [snapshot.players]);

	const activePlayer = snapshot.players.find((p) => p.id === snapshot.currentTurnPlayerId);
	const activePlayerIdx = playerIndexMap.get(snapshot.currentTurnPlayerId ?? "") ?? 0;
	const activeColor = pc(activePlayerIdx);

	const isMyTurn = snapshot.currentTurnPlayerId === me.id;
	const isAdmin  = snapshot.roomAdminId === me.id;
	const amInQueue = snapshot.players.some((p) => p.id === me.id);

	const selectedCell = selectedCellIndex === null ? undefined : snapshot.cells[selectedCellIndex];
	const canSubmit =
		isMyTurn &&
		selectedCellIndex !== null &&
		selectedCell !== undefined &&
		!selectedCell.fixed &&
		selectedCell.value === 0 &&
		pendingMove !== null &&
		pendingMove.cellIndex === selectedCellIndex &&
		pendingMove.value >= 1 &&
		pendingMove.value <= 9;

	React.useEffect(() => {
		if (!isMyTurn) {
			setPendingMove(null);
			setSelectedCellIndex(null);
		}
	}, [isMyTurn]);

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!isMyTurn || selectedCellIndex === null) return;
			const cell = snapshot.cells[selectedCellIndex];
			if (!cell || cell.fixed || cell.value !== 0) return;
			if (e.key >= "1" && e.key <= "9") {
				setPendingMove({ cellIndex: selectedCellIndex, value: Number(e.key) });
				setLocalMessage(null);
			} else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
				setPendingMove(null);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isMyTurn, selectedCellIndex, snapshot.cells]);

	// ── Early return for name picker (after all hooks) ─────────────────────

	if (!displayName) {
		return <NamePickerOverlay defaultName={me.name} onJoin={setDisplayName} />;
	}

	// ── Handlers ───────────────────────────────────────────────────────────

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit || selectedCellIndex === null || pendingMove === null) return;
		const result = submitSudokuMoveAndPassTurn(tree, {
			playerId: me.id,
			playerName: displayName,
			cellIndex: selectedCellIndex,
			value: pendingMove.value,
		});
		setLocalMessage(result.message);
		setPendingMove(null);
		setSelectedCellIndex(null);
	};

	const handlePass = () => {
		if (!isMyTurn) return;
		const result = passSudokuTurn(tree, me.id);
		setLocalMessage(result.message);
		setPendingMove(null);
		setSelectedCellIndex(null);
	};

	const statusMessage = localMessage ?? snapshot.lastValidationMessage;

	const cellHint =
		selectedCellIndex !== null && pendingMove?.cellIndex === selectedCellIndex
			? `R${Math.floor(selectedCellIndex / 9) + 1} C${(selectedCellIndex % 9) + 1} → ${pendingMove.value}`
			: selectedCellIndex !== null
				? `R${Math.floor(selectedCellIndex / 9) + 1} C${(selectedCellIndex % 9) + 1} — type 1–9`
				: "";

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div
			className="min-h-screen"
			style={{ background: P.bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", color: P.text }}
		>
			<div className="mx-auto max-w-4xl px-4 pt-5 pb-16 flex flex-col gap-5">

				{/* Header */}
				<header className="flex items-start justify-between gap-4">
					<div>
						<h1 className="text-base font-semibold" style={{ color: P.text }}>
							Collaborative Sudoku
						</h1>
						<p className="mt-0.5 text-xs" style={{ color: P.text3 }}>
							{snapshot.difficulty.toUpperCase()} · {users.length} online
							{snapshot.roomAdminName ? ` · room by ${snapshot.roomAdminName}` : ""}
						</p>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{!amInQueue && (
							<button
								type="button"
								onClick={() => {
									registerSudokuPlayer(tree, me.id, displayName);
									setLocalMessage("Rejoined the game.");
								}}
								className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
								style={{ background: P.card, border: `1px solid ${P.border}`, color: P.text2 }}
							>
								Rejoin
							</button>
						)}
						<button
							type="button"
							onClick={() => void navigator.clipboard.writeText(window.location.href)}
							className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
							style={{ background: P.card, border: `1px solid ${P.border}`, color: P.text3 }}
						>
							Copy link
						</button>
					</div>
				</header>

				{/* Main grid */}
				<div className="grid gap-5 lg:grid-cols-[1fr_200px]">

					{/* Board column */}
					<section className="flex flex-col gap-3">

						{/* ── TURN INDICATOR ─────────────────────────────── */}
						{isMyTurn ? (
							<div
								className="rounded-2xl px-5 py-4"
								style={{ background: P.accentLight, border: `2px solid ${P.accentBorder}` }}
							>
								<div className="flex items-center gap-2.5">
									<span className="w-3 h-3 rounded-full shrink-0" style={{ background: P.accent }} />
									<span className="text-lg font-bold tracking-tight" style={{ color: P.accent }}>
										Your turn
									</span>
								</div>
								<p className="mt-1.5 text-sm" style={{ color: P.text2 }}>
									{cellHint
										? `${cellHint} — press Submit or pick another cell`
										: "Click an empty cell, then type 1–9"}
								</p>
							</div>
						) : (
							<div
								className="rounded-2xl px-5 py-3.5"
								style={{ background: P.card, border: `1px solid ${P.border}` }}
							>
								<div className="flex items-center gap-2.5">
									{activePlayer && (
										<span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: activeColor }} />
									)}
									<span className="text-sm font-medium" style={{ color: P.text2 }}>
										{snapshot.players.length === 0
											? "Waiting for players to join…"
											: `${activePlayer?.name ?? "…"}'s turn`}
									</span>
								</div>
							</div>
						)}

						{/* Sudoku board */}
						<form onSubmit={handleSubmit}>
							<div
								className="mx-auto w-full max-w-[min(56vh,100%)] rounded-xl overflow-hidden transition-shadow duration-300"
								style={{
									boxShadow: isMyTurn
										? `0 0 0 2px ${P.accent}, 0 6px 24px rgba(82,109,138,0.14)`
										: `0 0 0 1px ${P.border}`,
								}}
							>
								<div className="grid grid-cols-9" style={{ background: P.borderMid, gap: "1px" }}>
									{snapshot.cells.map((cell, index) => {
										const row = Math.floor(index / 9);
										const col = index % 9;
										const isSelected = selectedCellIndex === index;
										const pendingValue = pendingMove?.cellIndex === index ? pendingMove.value : null;
										const displayValue = cell.value !== 0 ? cell.value : pendingValue;
										const isEditable = !cell.fixed && cell.value === 0;

										const mr = col % 3 === 2 && col !== 8 ? "1px" : "0";
										const mb = row % 3 === 2 && row !== 8 ? "1px" : "0";

										let bg: string;
										let textColor: string;
										if (isSelected)            { bg = P.accent;  textColor = "#fff"; }
										else if (cell.fixed)       { bg = P.subtle;  textColor = P.text2; }
										else if (pendingValue !== null) { bg = P.card; textColor = P.accent; }
										else if (cell.value !== 0) { bg = P.card;    textColor = P.text; }
										else                       { bg = P.card;    textColor = P.border; }

										return (
											<button
												key={index}
												type="button"
												data-testid={`cell-${index}`}
												data-fixed={cell.fixed ? "true" : "false"}
												onClick={() => {
													if (!isMyTurn || !isEditable) return;
													setSelectedCellIndex(index === selectedCellIndex ? null : index);
												}}
												className="aspect-square flex items-center justify-center font-semibold"
												style={{
													background: bg,
													color: textColor,
													marginRight: mr,
													marginBottom: mb,
													fontSize: "clamp(10px,1.9vw,15px)",
													cursor: isMyTurn && isEditable ? "pointer" : "default",
												}}
											>
												{displayValue ?? ""}
											</button>
										);
									})}
								</div>
							</div>

							{/* Action bar */}
							<div className="mt-3 flex items-center gap-2 flex-wrap">
								{cellHint && isMyTurn && (
									<span className="text-xs flex-1" style={{ color: P.text2 }}>{cellHint}</span>
								)}
								<div className="flex items-center gap-2 ml-auto">
									<button
										type="submit"
										disabled={!canSubmit}
										className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-30"
										style={{ background: P.accent }}
									>
										Submit move
									</button>
									<button
										type="button"
										disabled={!isMyTurn}
										onClick={handlePass}
										className="rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-30"
										style={{ background: P.card, border: `1px solid ${P.border}`, color: P.text2 }}
									>
										Pass
									</button>
								</div>
							</div>
						</form>

						{statusMessage && (
							<p className="text-xs" style={{ color: P.text3 }}>{statusMessage}</p>
						)}
					</section>

					{/* Sidebar */}
					<aside
						className="rounded-2xl p-4 self-start"
						style={{ background: P.card, border: `1px solid ${P.border}` }}
					>
						<h2 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.text3 }}>
							Scoreboard
						</h2>
						{snapshot.players.length === 0 ? (
							<p className="text-xs" style={{ color: P.text3 }}>No players yet.</p>
						) : (
							<ul className="space-y-1">
								{snapshot.players.map((player, index) => {
									const color = pc(index);
									const isActive = player.id === snapshot.currentTurnPlayerId;
									const isMe = player.id === me.id;
									return (
										<li
											key={player.id}
											className="flex items-center justify-between rounded-lg px-2 py-1.5"
											style={{ background: isActive ? P.accentLight : "transparent" }}
										>
											<div className="flex items-center gap-2 min-w-0">
												<span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
												<span
													className="text-sm truncate"
													style={{ color: isActive ? P.accent : P.text2, fontWeight: isActive ? 600 : 400 }}
												>
													{player.name}
													{isMe && (
														<span className="ml-1 text-xs font-normal" style={{ color: P.text3 }}>you</span>
													)}
												</span>
												{isActive && (
													<span className="text-[9px] shrink-0" style={{ color: P.accent }}>▶</span>
												)}
											</div>
											<div className="flex items-center gap-1 ml-1 shrink-0">
												<span className="text-xs font-semibold tabular-nums" style={{ color }}>
													{player.points >= 0 ? "+" : ""}{player.points}
												</span>
												{isAdmin && player.id !== me.id && (
													<button
														type="button"
														onClick={() => kickSudokuPlayer(tree, me.id, player.id)}
														className="ml-1 text-[11px] leading-none transition"
														style={{ color: P.text3 }}
														title="Kick"
													>
														×
													</button>
												)}
											</div>
										</li>
									);
								})}
							</ul>
						)}
					</aside>
				</div>
			</div>

			<div
				className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 text-[11px] select-none"
				style={{ color: P.text3 }}
			>
				created by aimee leong
			</div>
		</div>
	);
}
