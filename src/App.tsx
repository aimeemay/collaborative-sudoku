import React from "react";
import { useFluidRuntime } from "./react/contexts/FluidContext.js";
import { useSharedTreeState } from "./react/hooks/useSharedTreeState.js";
import {
	getSudokuSnapshot,
	kickSudokuPlayer,
	registerSudokuPlayer,
	submitSudokuMoveAndPassTurn,
	passSudokuTurn,
	lockSudokuCell,
	unlockSudokuCell,
	submitCoSudokuMove,
	claimAdminRole,
	isNameTaken,
	removeDisconnectedPlayers,
} from "./infra/sharedTreeClient.js";
import { usePresenceUsers, useCellPresence } from "./infra/presenceClient.js";
import type { AppModel } from "./schema/starterSchema.js";

// ─── Palette ───────────────────────────────────────────────────────────────

const P = {
	// Gradient background – warm beige
	bgFrom:       "#f5f0e8",
	bgVia:        "#f8f3eb",
	bgTo:         "#f2ede4",
	// Frosted glass – warm tint
	glass:        "rgba(255,252,247,0.55)",
	glassBold:    "rgba(255,252,247,0.72)",
	glassBorder:  "rgba(220,210,195,0.45)",
	// Text
	text:         "#2c2418",
	text2:        "#7a6b58",
	text3:        "#b0a290",
	// Accent – warm tan/brown
	accent:       "#8b7355",
	accentSoft:   "rgba(139,115,85,0.10)",
	accentBorder: "rgba(139,115,85,0.25)",
	// Board
	boardLine:    "rgba(180,165,140,0.25)",
	cellFixed:    "rgba(245,240,232,0.95)",
	cellEmpty:    "rgba(255,252,248,0.95)",
} as const;

// Player colors — slate-toned, slightly greyed, harmonious with beige palette
const PCOLORS = [
	"#6b8cba", // slate blue
	"#b87070", // dusty rose
	"#a8893a", // muted gold
	"#5a9e85", // sage green
	"#8a73b5", // greyed violet
	"#b87d5a", // warm clay
	"#5a96a8", // muted teal
	"#a86990", // greyed mauve
];
const pc = (i: number) => PCOLORS[i % PCOLORS.length];

const glassCard: React.CSSProperties = {
	background: P.glass,
	backdropFilter: "blur(24px) saturate(1.4)",
	WebkitBackdropFilter: "blur(24px) saturate(1.4)",
	border: `1px solid ${P.glassBorder}`,
	boxShadow: "0 2px 16px rgba(80,60,30,0.04), 0 0.5px 0 rgba(255,255,255,0.5) inset",
};

const glassBoldCard: React.CSSProperties = {
	background: P.glassBold,
	backdropFilter: "blur(32px) saturate(1.5)",
	WebkitBackdropFilter: "blur(32px) saturate(1.5)",
	border: `1px solid ${P.glassBorder}`,
	boxShadow: "0 4px 24px rgba(80,60,30,0.06), 0 0.5px 0 rgba(255,255,255,0.6) inset",
};

// ─── Name Picker ───────────────────────────────────────────────────────────

function NamePickerOverlay({
	defaultName,
	takenNames,
	onJoin,
}: {
	defaultName: string;
	takenNames: string[];
	onJoin: (name: string) => void;
}) {
	const [name, setName] = React.useState(defaultName);
	const trimmed = name.trim();
	const isTaken = takenNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());

	return (
		<div
			className="min-h-screen flex items-center justify-center px-4"
			style={{
				background: `linear-gradient(135deg, ${P.bgFrom} 0%, ${P.bgVia} 50%, ${P.bgTo} 100%)`,
				fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
			}}
		>
			<div className="w-full max-w-[340px] flex flex-col gap-5">
				<div className="text-center">
					<h1 className="text-xl font-bold tracking-tight" style={{ color: P.text, letterSpacing: "-0.02em" }}>
						Collaborative Sudoku
					</h1>
					<p className="mt-1 text-[13px]" style={{ color: P.text3 }}>
						Pick a name to join the game
					</p>
				</div>
				<div
					className="rounded-3xl p-6"
					style={glassBoldCard}
				>
					<form
						onSubmit={(e) => { e.preventDefault(); if (trimmed && !isTaken) onJoin(trimmed); }}
						className="flex flex-col gap-3.5"
					>
						<div className="flex flex-col gap-1.5">
							<input
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
								placeholder="Your name"
								className="w-full rounded-2xl px-4 py-3 text-sm outline-none transition-all duration-200"
								style={{
									background: "rgba(255,255,255,0.6)",
									border: `1.5px solid ${isTaken ? "#b85450" : "rgba(0,0,0,0.06)"}`,
									color: P.text,
									boxShadow: "0 1px 4px rgba(0,0,0,0.03) inset",
								}}
								onFocus={(e) => {
									if (!isTaken) {
										e.currentTarget.style.borderColor = P.accent;
										e.currentTarget.style.boxShadow = `0 0 0 3px ${P.accentSoft}`;
									}
								}}
								onBlur={(e) => {
									e.currentTarget.style.borderColor = isTaken ? "#b85450" : "rgba(0,0,0,0.06)";
									e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.03) inset";
								}}
							/>
							{isTaken && trimmed && (
								<p className="text-[12px] font-medium" style={{ color: "#b85450" }}>
									That name is already taken in this room.
								</p>
							)}
						</div>
						<button
							type="submit"
							disabled={!trimmed || isTaken}
							className="w-full rounded-2xl py-3 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-35"
							style={{
								background: `linear-gradient(135deg, ${P.accent}, #a08665)`,
								boxShadow: "0 2px 12px rgba(139,115,85,0.3), 0 0.5px 0 rgba(255,255,255,0.15) inset",
							}}
						>
							Join Game
						</button>
					</form>
				</div>
				<p className="text-center text-[11px] font-medium" style={{ color: P.text3 }}>
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

	const isCo = snapshot.gameMode === "cosudoku";

	// ── ALL hooks must come before any early return ────────────────────────

	const [displayName, setDisplayName] = React.useState<string | null>(null);
	const [selectedCellIndex, setSelectedCellIndex] = React.useState<number | null>(null);
	const [pendingMove, setPendingMove] = React.useState<{ cellIndex: number; value: number } | null>(null);
	const [copied, setCopied] = React.useState(false);
	// Highlight helpers: tapping a filled cell highlights matching numbers + row/col
	const [highlightNumber, setHighlightNumber] = React.useState<number | null>(null);
	const [highlightOrigin, setHighlightOrigin] = React.useState<number | null>(null);

	const users = usePresenceUsers(presence.users);
	const remoteCells = useCellPresence(presence.cursor, presence.users);

	React.useEffect(() => {
		if (!displayName) return;
		registerSudokuPlayer(tree, me.id, displayName);
	}, [tree, me.id, displayName]);

	const playerIndexMap = React.useMemo(() => {
		const m = new Map<string, number>();
		snapshot.players.forEach((p, i) => m.set(p.id, i));
		return m;
	}, [snapshot.players]);

	const myPlayerIdx = playerIndexMap.get(me.id) ?? 0;
	const myColor = pc(myPlayerIdx);

	// Broadcast my hovered cell to other players
	React.useEffect(() => {
		if (selectedCellIndex !== null) {
			presence.cursor.setCursorPosition(selectedCellIndex, myPlayerIdx);
			presence.cursor.showCursor();
		} else {
			presence.cursor.hideCursor();
		}
	}, [selectedCellIndex, myPlayerIdx, presence.cursor]);

	const activePlayer = snapshot.players.find((p) => p.id === snapshot.currentTurnPlayerId);
	const activePlayerIdx = playerIndexMap.get(snapshot.currentTurnPlayerId ?? "") ?? 0;
	const activeColor = pc(activePlayerIdx);

	const isMyTurn = isCo ? true : snapshot.currentTurnPlayerId === me.id;
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

	// In classic mode, clear selection when turn changes
	React.useEffect(() => {
		if (isCo) return;
		if (!isMyTurn) {
			setPendingMove(null);
			setSelectedCellIndex(null);
		}
	}, [isMyTurn, isCo]);

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Cmd/Ctrl+Enter submits the staged move from anywhere
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				if (canSubmit && selectedCellIndex !== null && pendingMove !== null && displayName) {
					e.preventDefault();
					if (isCo) {
						submitCoSudokuMove(tree, {
							playerId: me.id,
							playerName: displayName,
							cellIndex: selectedCellIndex,
							value: pendingMove.value,
						});
					} else {
						submitSudokuMoveAndPassTurn(tree, {
							playerId: me.id,
							playerName: displayName,
							cellIndex: selectedCellIndex,
							value: pendingMove.value,
						});
					}
					setPendingMove(null);
					setSelectedCellIndex(null);
				}
				return;
			}
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (selectedCellIndex === null) return;
			if (!isCo && !isMyTurn) return;
			const cell = snapshot.cells[selectedCellIndex];
			if (!cell || cell.fixed || cell.value !== 0) return;
			if (isCo && cell.lockedBy && cell.lockedBy !== me.id) return;
			if (e.key >= "1" && e.key <= "9") {
				e.preventDefault();
				setPendingMove({ cellIndex: selectedCellIndex, value: Number(e.key) });
			} else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
				e.preventDefault();
				setPendingMove(null);
			} else if (e.key === "Escape") {
				if (isCo) unlockSudokuCell(tree, me.id);
				setPendingMove(null);
				setSelectedCellIndex(null);
				setHighlightNumber(null);
				setHighlightOrigin(null);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isMyTurn, isCo, selectedCellIndex, snapshot.cells, tree, me.id, canSubmit, pendingMove, displayName]);

	// Clear highlight when clicking outside the grid
	React.useEffect(() => {
		const onDocClick = (e: MouseEvent) => {
			const grid = document.querySelector("[data-sudoku-grid]");
			if (grid && !grid.contains(e.target as Node)) {
				setHighlightNumber(null);
				setHighlightOrigin(null);
			}
		};
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, []);

	// Admin succession: when admin leaves, first remaining player in join order claims the role
	React.useEffect(() => {
		if (!displayName) return;
		const adminId = snapshot.roomAdminId;
		if (!adminId) return;
		if (adminId === me.id) return; // I'm already admin
		const connectedIds = new Set(users.map((u) => u.value.id));
		connectedIds.add(me.id); // presence only returns remotes; always include self
		const adminPresent = connectedIds.has(adminId);
		if (adminPresent) return;
		// Admin is gone — am I the first in join order among connected players?
		const firstPresent = snapshot.players.find((p) => connectedIds.has(p.id));
		if (firstPresent?.id === me.id) {
			claimAdminRole(tree, me.id, displayName);
		}
	}, [users, snapshot.roomAdminId, snapshot.players, me.id, displayName, tree]);

	// Stale player cleanup: any client removes disconnected players (concurrent ops are safe)
	React.useEffect(() => {
		if (!displayName) return;
		const connectedIds = new Set(users.map((u) => u.value.id));
		connectedIds.add(me.id); // presence only returns remotes; always include self
		const hasStale = snapshot.players.some((p) => !connectedIds.has(p.id));
		if (hasStale) removeDisconnectedPlayers(tree, connectedIds);
	}, [users, snapshot.players, me.id, displayName, tree]);

	// ── Early return for name picker (after all hooks) ─────────────────────

	if (!displayName) {
		return (
			<NamePickerOverlay
				defaultName={me.name}
				takenNames={snapshot.players.map((p) => p.name)}
				onJoin={setDisplayName}
			/>
		);
	}

	// ── Handlers ───────────────────────────────────────────────────────────

	const handleCellClick = (index: number) => {
		const cell = snapshot.cells[index];
		if (!cell) return;

		// Clicking a filled/fixed cell → highlight helpers (don't touch lock or selection)
		if (cell.fixed || cell.value !== 0) {
			const val = cell.value;
			if (highlightNumber === val && highlightOrigin === index) {
				setHighlightNumber(null);
				setHighlightOrigin(null);
			} else {
				setHighlightNumber(val);
				setHighlightOrigin(index);
			}
			return;
		}

		// Clear highlights when selecting an editable cell
		setHighlightNumber(null);
		setHighlightOrigin(null);

		if (isCo) {
			// In CoSudoku: lock the cell
			if (cell.lockedBy && cell.lockedBy !== me.id) return;
			if (index === selectedCellIndex) {
				unlockSudokuCell(tree, me.id);
				setSelectedCellIndex(null);
				setPendingMove(null);
			} else {
				lockSudokuCell(tree, index, me.id, displayName);
				setSelectedCellIndex(index);
				setPendingMove(null);
			}
		} else {
			if (!isMyTurn) return;
			setSelectedCellIndex(index === selectedCellIndex ? null : index);
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit || selectedCellIndex === null || pendingMove === null) return;

		if (isCo) {
			submitCoSudokuMove(tree, {
				playerId: me.id,
				playerName: displayName,
				cellIndex: selectedCellIndex,
				value: pendingMove.value,
			});
		} else {
			submitSudokuMoveAndPassTurn(tree, {
				playerId: me.id,
				playerName: displayName,
				cellIndex: selectedCellIndex,
				value: pendingMove.value,
			});
		}
		setPendingMove(null);
		setSelectedCellIndex(null);
	};

	const handlePass = () => {
		if (isCo) return;
		if (!isMyTurn) return;
		passSudokuTurn(tree, me.id);
		setPendingMove(null);
		setSelectedCellIndex(null);
	};

	// ── Render ─────────────────────────────────────────────────────────────

	const roomCode = new URLSearchParams(window.location.search).get("id") ?? "";

	return (
		<div
			className="min-h-screen"
			style={{
				background: `linear-gradient(135deg, ${P.bgFrom} 0%, ${P.bgVia} 50%, ${P.bgTo} 100%)`,
				fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
				color: P.text,
			}}
		>
			<div className="mx-auto max-w-5xl px-5 pt-6 pb-20 flex flex-col gap-5">

				{/* Header */}
				<header className="flex items-start justify-between gap-4">
					<div>
						<h1 className="text-base font-bold tracking-tight" style={{ color: P.text, letterSpacing: "-0.02em" }}>
							{isCo ? "CoSudoku" : "Collaborative Sudoku"}
						</h1>
						<p className="mt-0.5 text-[12px] font-medium" style={{ color: P.text3 }}>
							{snapshot.difficulty.toUpperCase()} · {users.length} online
							{isCo ? " · simultaneous" : ""}
						</p>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{roomCode && (
							<span
								className="rounded-xl px-3 py-1.5 text-[11px] font-mono tracking-wide select-all"
								style={{ ...glassCard, color: P.text2 }}
							>
								{roomCode.slice(0, 8)}…
							</span>
						)}
						{!amInQueue && (
							<button
								type="button"
								onClick={() => {
									registerSudokuPlayer(tree, me.id, displayName);
								}}
								className="rounded-xl px-3.5 py-1.5 text-[12px] font-medium transition-all duration-200 hover:opacity-80 cursor-pointer"
								style={{ ...glassCard, color: P.text2 }}
							>
								Rejoin
							</button>
						)}
						<button
							type="button"
							onClick={() => {
								void navigator.clipboard.writeText(window.location.href);
								setCopied(true);
								setTimeout(() => setCopied(false), 2000);
							}}
							className="rounded-xl px-3.5 py-1.5 text-[12px] font-medium transition-all duration-200 hover:opacity-80 cursor-pointer"
							style={{ ...glassCard, color: P.accent }}
						>
							{copied ? "Copied!" : "Copy link"}
						</button>
					</div>
				</header>

				{/* Main layout: board + unified sidebar */}
				<div className="grid gap-5 lg:grid-cols-[1fr_220px] items-start">

					{/* Board column */}
					<form onSubmit={handleSubmit}>
						<div className="mx-auto w-full max-w-[min(72vh,520px)]">
							<div
								className="rounded-2xl overflow-hidden transition-shadow duration-300"
								style={{
									...glassBoldCard,
									boxShadow: glassBoldCard.boxShadow,
								}}
							>
								<div className="grid grid-cols-9" data-sudoku-grid style={{ background: P.boardLine, gap: "1px", padding: "2px", borderRadius: "16px" }}>
									{snapshot.cells.map((cell, index) => {
										const row = Math.floor(index / 9);
										const col = index % 9;
										const isSelected = selectedCellIndex === index;
										const pendingValue = pendingMove?.cellIndex === index ? pendingMove.value : null;
										const displayValue = cell.value !== 0 ? cell.value : pendingValue;
										const isEditable = !cell.fixed && cell.value === 0;
										const lockedByOther = isCo && cell.lockedBy && cell.lockedBy !== me.id;
										const lockedByMe = isCo && cell.lockedBy === me.id;
										const lockerIdx = cell.lockedBy ? (playerIndexMap.get(cell.lockedBy) ?? 0) : 0;
										const lockerColor = cell.lockedBy ? pc(lockerIdx) : P.text3;
										const remotePeers = remoteCells.get(index) ?? [];

										// Highlight helpers
										const originRow = highlightOrigin !== null ? Math.floor(highlightOrigin / 9) : -1;
										const originCol = highlightOrigin !== null ? highlightOrigin % 9 : -1;
										const isNumberMatch = highlightNumber !== null && cell.value === highlightNumber && cell.value !== 0;
										const isRowColHighlight = highlightOrigin !== null && !isNumberMatch && (row === originRow || col === originCol);
										const isHighlightOriginCell = index === highlightOrigin;

										// Thicker borders at 3×3 box edges
										const borderR = col % 3 === 2 && col !== 8 ? `2px solid ${P.boardLine}` : "none";
										const borderB = row % 3 === 2 && row !== 8 ? `2px solid ${P.boardLine}` : "none";

										let bg: string;
										let textColor: string;
										let fontWeight = 500;
										let outline = "";
										if (isSelected)                    { bg = myColor;    textColor = "#fff"; fontWeight = 700; }
										else if (lockedByOther)            { bg = `${lockerColor}15`; textColor = lockerColor; fontWeight = 600; outline = `2px solid ${lockerColor}40`; }
										else if (lockedByMe)               { bg = `${myColor}15`; textColor = myColor; fontWeight = 600; outline = `2px solid ${myColor}40`; }
										else if (isHighlightOriginCell)    { bg = "#ede8e0"; textColor = P.text; fontWeight = 700; }
										else if (isNumberMatch)            { bg = "#f2ede6"; textColor = P.text; fontWeight = 700; }
										else if (isRowColHighlight)        { bg = "#f7f3ee"; textColor = cell.fixed ? P.text2 : cell.value !== 0 ? P.text : "rgba(0,0,0,0.08)"; fontWeight = cell.fixed || cell.value !== 0 ? 500 : 400; }
										else if (cell.fixed)               { bg = P.cellFixed; textColor = P.text2; fontWeight = 600; }
										else if (pendingValue !== null)     { bg = P.cellEmpty; textColor = isCo ? myColor : P.accent; fontWeight = 700; }
										else if (cell.value !== 0)         { bg = P.cellEmpty; textColor = P.text; fontWeight = 600; }
										else                               { bg = P.cellEmpty; textColor = "rgba(0,0,0,0.08)"; }

										return (
											<button
												key={index}
												type="button"
												data-testid={`cell-${index}`}
												data-fixed={cell.fixed ? "true" : "false"}
												onClick={() => handleCellClick(index)}
												className="aspect-square flex items-center justify-center transition-colors duration-100 relative"
												style={{
													background: bg,
													color: textColor,
													borderRight: borderR,
													borderBottom: borderB,
													fontSize: "clamp(14px, 2.4vw, 20px)",
													fontWeight,
													cursor: isEditable && !lockedByOther ? "pointer" : "default",
													fontVariantNumeric: "tabular-nums",
													letterSpacing: "-0.01em",
													outline,
													outlineOffset: "-2px",
												}}
											>
												{displayValue ?? ""}
												{lockedByOther && !displayValue && (
													<span
														className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
														style={{ background: lockerColor }}
													/>
												)}
												{remotePeers.length > 0 && !isSelected && (
													<span className="absolute top-0.5 left-0.5 flex gap-px">
														{remotePeers.slice(0, 3).map((rp, ri) => (
															<span
																key={ri}
																className="w-1.5 h-1.5 rounded-full"
																style={{ background: pc(rp.colorIndex), boxShadow: `0 0 3px ${pc(rp.colorIndex)}60` }}
																title={rp.playerName}
															/>
														))}
													</span>
												)}
											</button>
										);
									})}
								</div>
							</div>

							{/* Action buttons — inside the same max-w wrapper so they align */}
							<div className="mt-4 flex items-center gap-2.5 justify-end">
								<button
									type="submit"
									disabled={!canSubmit}
									className="rounded-2xl px-5 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-30"
									style={{
										background: isCo
											? `linear-gradient(135deg, ${myColor}, ${myColor}cc)`
											: `linear-gradient(135deg, ${P.accent}, #a08665)`,
										boxShadow: canSubmit ? `0 2px 12px ${isCo ? myColor : "rgba(139,115,85,0.3)"}40` : "none",
									}}
								>
									Submit
									<span className="ml-1.5 text-[10px] font-normal opacity-70">⌘↵</span>
								</button>
								{!isCo && (
									<button
										type="button"
										disabled={!isMyTurn}
										onClick={handlePass}
										className="rounded-2xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200 disabled:opacity-30"
										style={glassCard}
									>
										Pass
									</button>
								)}
							</div>
							<p className="mt-2 text-[11px] text-right" style={{ color: P.text3 }}>
								Correct +1 · Incorrect −1{!isCo ? " · Pass 0" : ""}
							</p>
						</div>
					</form>

					{/* ── Unified sidebar ──────────── */}
					<aside
						className="rounded-3xl p-5 self-start flex flex-col gap-4"
						style={glassBoldCard}
					>
						{/* Turn / mode indicator */}
						{isCo ? (
							<div
								className="rounded-2xl px-4 py-3"
								style={{
									background: "rgba(0,0,0,0.02)",
									border: `1px solid rgba(0,0,0,0.04)`,
								}}
							>
								<p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: P.text3 }}>
									How To Play
								</p>
								<ol className="flex flex-col gap-1 mt-0.5">
									{["Click to lock a cell", "Type your number", "Submit"].map((step, i) => (
										<li key={i} className="flex items-center gap-2">
											<span
												className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
												style={{ background: "rgba(139,115,85,0.10)", color: P.text3 }}
											>
												{i + 1}
											</span>
											<span className="text-[11px]" style={{ color: P.text2 }}>{step}</span>
										</li>
									))}
								</ol>
								<p className="text-[10px] font-bold uppercase tracking-[0.12em] mt-2.5 mb-1.5" style={{ color: P.text3 }}>
									How To Win
								</p>
								<p className="text-[11px] leading-relaxed" style={{ color: P.text2 }}>
									We win together — pick up points (and friends) along the way.
								</p>
							</div>
						) : (
							<div
								className="rounded-2xl px-4 py-3"
								style={{
									background: isMyTurn ? P.accentSoft : "rgba(0,0,0,0.02)",
									border: isMyTurn ? `1.5px solid ${P.accentBorder}` : `1px solid rgba(0,0,0,0.04)`,
								}}
							>
								<div className="flex items-center gap-2">
									<span
										className="w-2 h-2 rounded-full shrink-0"
										style={{
											background: isMyTurn ? P.accent : (activeColor ?? P.text3),
											boxShadow: isMyTurn ? `0 0 6px ${P.accentBorder}` : "none",
										}}
									/>
									<span
										className="text-[13px] font-semibold"
										style={{ color: isMyTurn ? P.accent : P.text2 }}
									>
										{isMyTurn
											? "Your turn"
											: snapshot.players.length === 0
												? "Waiting…"
												: `${activePlayer?.name ?? "…"}'s turn`}
									</span>
								</div>
							</div>
						)}

						{/* Divider */}
						<div style={{ height: 1, background: P.glassBorder }} />

						{/* Scoreboard */}
						<div>
							<h2
								className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2.5"
								style={{ color: P.text3 }}
							>
								Scoreboard
							</h2>
							{snapshot.players.length === 0 ? (
								<p className="text-[12px]" style={{ color: P.text3 }}>No players yet.</p>
							) : (
								<ul className="space-y-0.5">
									{snapshot.players.map((player, index) => {
										const color = pc(index);
										const isActive = !isCo && player.id === snapshot.currentTurnPlayerId;
										const isMe = player.id === me.id;
										const isPlayerAdmin = player.id === snapshot.roomAdminId;
										return (
											<li
												key={player.id}
												className="flex items-center justify-between rounded-xl px-2.5 py-2 transition-colors duration-200"
												style={{ background: isActive ? P.accentSoft : "transparent" }}
											>
												<div className="flex items-center gap-2 min-w-0">
													<span
														className="w-2 h-2 rounded-full shrink-0"
														style={{ background: color, boxShadow: `0 0 6px ${color}40` }}
													/>
													<span
														className="text-[13px] truncate"
														style={{
															color: isCo ? color : isActive ? P.accent : P.text2,
															fontWeight: isCo ? 500 : isActive ? 600 : 400,
														}}
													>
														{player.name}
														{isMe && (
															<span className="ml-1 text-[11px] font-normal" style={{ color: P.text3 }}>you</span>
														)}
													</span>
													{isPlayerAdmin && (
														<span className="text-[10px] shrink-0" title="Room admin" style={{ color: P.text3 }}>👑</span>
													)}
													{isActive && (
														<span className="text-[8px] shrink-0" style={{ color: P.accent }}>▶</span>
													)}
												</div>
												<div className="flex items-center gap-1 ml-1 shrink-0">
													<span className="text-[12px] font-semibold tabular-nums" style={{ color }}>
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
						</div>
					</aside>
				</div>
			</div>

			<div
				className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-medium select-none"
				style={{ color: P.text3 }}
			>
				created by aimee leong
			</div>
		</div>
	);
}
