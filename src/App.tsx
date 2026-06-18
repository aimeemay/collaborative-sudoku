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
	replaySudokuRoom,
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

// ─── Sound ─────────────────────────────────────────────────────────────────

// Shared AudioContext — created lazily on first user gesture
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
	try {
		if (!_audioCtx) {
			_audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
		}
		if (_audioCtx.state === "suspended") void _audioCtx.resume();
		return _audioCtx;
	} catch { return null; }
}

function playSuccessSound() {
	const ctx = getAudioCtx();
	if (!ctx) return;
	([523.25, 659.25, 783.99] as const).forEach((freq, i) => {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.type = "sine";
		osc.frequency.value = freq;
		const t = ctx.currentTime + i * 0.075;
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
		osc.start(t);
		osc.stop(t + 0.32);
	});
}

function playWrongSound() {
	const ctx = getAudioCtx();
	if (!ctx) return;
	// Descending droopy slide — melancholy whomp
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.type = "sine";
	const now = ctx.currentTime;
	osc.frequency.setValueAtTime(340, now);
	osc.frequency.exponentialRampToValueAtTime(150, now + 0.42);
	gain.gain.setValueAtTime(0.18, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
	osc.start(now);
	osc.stop(now + 0.57);
}

function playVictorySound() {
	const ctx = getAudioCtx();
	if (!ctx) return;
	// Triumphant yayyyy — ascending major chord arpeggio then full chord bloom
	const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
	const delays = [0, 0.10, 0.20, 0.30, 0.42];
	const now = ctx.currentTime;
	notes.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.type = i < 3 ? "triangle" : "sine";
		osc.frequency.setValueAtTime(freq, now);
		const t = now + delays[i];
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(0.14, t + 0.05);
		gain.gain.setValueAtTime(0.14, t + 0.25);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
		osc.start(t);
		osc.stop(t + 1.5);
	});
}

// ─── Confetti particles ────────────────────────────────────────────────────

const CONFETTI_COLORS = [
	'#e8706a', // coral
	'#6b8dd4', // cobalt blue
	'#5ecfb8', // teal mint
	'#f0b340', // amber gold
	'#d4a0c8', // lavender
	'#e8a090', // salmon peach
	'#4eb5d4', // sky blue
	'#f07a5a', // burnt coral
];

type ConfettiParticle = {
	id: number;
	left: number; // % x within cell
	top: number;  // % y start
	dx: number;   // px final x offset from start
	dy: number;   // px final y offset from start
	width: number;
	height: number;
	radius: string;
	color: string;
	borderColor?: string;
	delay: number;
	duration: number;
	spin: number;
};

function makeConfetti(cellIdx: number, playerColor: string): ConfettiParticle[] {
	// Simple seeded LCG so each cell gets consistent-but-varied particles
	let seed = (cellIdx + 1) * 1664525 + 1013904223;
	const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

	const colors = [playerColor, ...CONFETTI_COLORS];
	return Array.from({ length: 10 }, (_, i) => {
		const angle = (i / 10) * Math.PI * 2 + rng() * 1.2;
		const dist = 14 + rng() * 16;
		const typeRoll = rng();
		// shapes: filled circle, ring, pill, small dot
		let width: number, height: number, radius: string, borderColor: string | undefined;
		if (typeRoll < 0.30) {
			// filled circle
			const s = 4 + rng() * 5; width = s; height = s; radius = '50%';
		} else if (typeRoll < 0.50) {
			// ring (outline circle)
			const s = 5 + rng() * 5; width = s; height = s; radius = '50%';
			borderColor = colors[(i + cellIdx + 3) % colors.length];
		} else if (typeRoll < 0.75) {
			// pill
			width = 6 + rng() * 6; height = 3 + rng() * 2; radius = '99px';
		} else {
			// tiny dot
			const s = 2 + rng() * 2; width = s; height = s; radius = '50%';
		}
		return {
			id: i,
			left: 20 + rng() * 60,
			top: 10 + rng() * 50,
			dx: Math.cos(angle) * dist,
			dy: Math.sin(angle) * dist + 10,
			width,
			height,
			radius,
			color: borderColor ? 'transparent' : colors[(i + cellIdx) % colors.length],
			borderColor,
			delay: rng() * 100,
			duration: 420 + rng() * 220,
			spin: (rng() - 0.5) * 600,
		};
	});
}

// ─── Victory confetti (full-screen rain) ─────────────────────────────────────

type VictoryParticle = {
	id: number;
	left: number;   // vw %
	width: number;
	height: number;
	radius: string;
	color: string;
	borderColor?: string;
	delay: number;  // ms
	duration: number; // ms
	spin: number;
	drift: number; // px horizontal drift during fall
};

function makeVictoryConfetti(): VictoryParticle[] {
	return Array.from({ length: 60 }, (_, i) => {
		const rng = (() => {
			let s = (i + 1) * 22695477 + 1;
			return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
		})();
		const typeRoll = rng();
		let width: number, height: number, radius: string, borderColor: string | undefined;
		const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
		if (typeRoll < 0.25) {
			const s = 6 + rng() * 8; width = s; height = s; radius = '50%';
		} else if (typeRoll < 0.45) {
			const s = 6 + rng() * 7; width = s; height = s; radius = '50%';
			borderColor = CONFETTI_COLORS[(i + 3) % CONFETTI_COLORS.length];
		} else if (typeRoll < 0.70) {
			width = 8 + rng() * 10; height = 4 + rng() * 3; radius = '99px';
		} else {
			const s = 3 + rng() * 3; width = s; height = s; radius = '50%';
		}
		return {
			id: i,
			left: rng() * 100,
			width,
			height,
			radius,
			color: borderColor ? 'transparent' : color,
			borderColor,
			delay: rng() * 1200,
			duration: 1800 + rng() * 1400,
			spin: (rng() - 0.5) * 720,
			drift: (rng() - 0.5) * 80,
		};
	});
}


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
						What's Your Name?
					</h1>
					<p className="mt-1 text-[13px]" style={{ color: P.text3 }}>
						This is the alias the room will know you by
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
	const [highlightNumber, setHighlightNumber] = React.useState<number | null>(null);
	const [highlightOrigin, setHighlightOrigin] = React.useState<number | null>(null);
	const [wrongCell, setWrongCell] = React.useState<{ index: number; value: number } | null>(null);

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

	// ── Celebration state ──────────────────────────────────────────────────
	const [confettiCells, setConfettiCells] = React.useState<Map<number, ConfettiParticle[]>>(new Map());
	const prevCellValuesRef = React.useRef<number[]>([]);

	React.useEffect(() => {
		const prev = prevCellValuesRef.current;
		const curr = snapshot.cells.map((c) => c.value);
		if (prev.length > 0) {
			const newlySet: Array<[number, number]> = [];
			snapshot.cells.forEach((cell, i) => {
				if (!cell.fixed && (prev[i] ?? 0) === 0 && cell.value !== 0) {
					const solverIdx = cell.solvedBy ? (playerIndexMap.get(cell.solvedBy) ?? 0) : myPlayerIdx;
					newlySet.push([i, solverIdx]);
				}
			});
			if (newlySet.length > 0) {
				playSuccessSound();
				setConfettiCells((old) => {
					const next = new Map(old);
					newlySet.forEach(([idx, colorIdx]) => {
						next.set(idx, makeConfetti(idx, pc(colorIdx)));
					});
					return next;
				});
				setTimeout(() => {
					setConfettiCells((old) => {
						const next = new Map(old);
						newlySet.forEach(([idx]) => next.delete(idx));
						return next;
					});
				}, 750);
			}
		}
		prevCellValuesRef.current = curr;
	}, [snapshot.cells, playerIndexMap, myPlayerIdx]);

	// ── Victory detection ───────────────────────────────────────────────────
	const isPuzzleComplete = React.useMemo(() =>
		snapshot.cells.length === 81 &&
		snapshot.cells.every((c, i) => c.value !== 0 && c.value.toString() === snapshot.solution[i]),
		[snapshot.cells, snapshot.solution]
	);

	type GamePhase = 'playing' | 'complete';
	const [gamePhase, setGamePhase] = React.useState<GamePhase>('playing');
	const [victoryConfetti, setVictoryConfetti] = React.useState<VictoryParticle[]>([]);
	const victoryFiredRef = React.useRef(false);

	React.useEffect(() => {
		if (isPuzzleComplete && !victoryFiredRef.current) {
			victoryFiredRef.current = true;
			setTimeout(() => {
				playVictorySound();
				setVictoryConfetti(makeVictoryConfetti());
				setGamePhase('complete');
			}, 600); // small delay to let last cell animation play
		}
		if (!isPuzzleComplete) {
			victoryFiredRef.current = false;
		}
	}, [isPuzzleComplete]);

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
			// Enter submits the staged move from anywhere
			if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.key === "Enter") {
				if (canSubmit && selectedCellIndex !== null && pendingMove !== null && displayName) {
					e.preventDefault();
					const cellIdx = selectedCellIndex;
					const pendingVal = pendingMove.value;
					let result;
					if (isCo) {
						result = submitCoSudokuMove(tree, {
							playerId: me.id,
							playerName: displayName,
							cellIndex: cellIdx,
							value: pendingVal,
						});
					} else {
						result = submitSudokuMoveAndPassTurn(tree, {
							playerId: me.id,
							playerName: displayName,
							cellIndex: cellIdx,
							value: pendingVal,
						});
					}
					setPendingMove(null);
					setSelectedCellIndex(null);
					if (!result.committed) {
						playWrongSound();
						setWrongCell({ index: cellIdx, value: pendingVal });
						setTimeout(() => setWrongCell(null), 750);
					}
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

		const cellIdx = selectedCellIndex;
		const pendingVal = pendingMove.value;

		let result;
		if (isCo) {
			result = submitCoSudokuMove(tree, {
				playerId: me.id,
				playerName: displayName,
				cellIndex: cellIdx,
				value: pendingVal,
			});
		} else {
			result = submitSudokuMoveAndPassTurn(tree, {
				playerId: me.id,
				playerName: displayName,
				cellIndex: cellIdx,
				value: pendingVal,
			});
		}
		setPendingMove(null);
		setSelectedCellIndex(null);

		if (!result.committed) {
			playWrongSound();
			setWrongCell({ index: cellIdx, value: pendingVal });
			setTimeout(() => setWrongCell(null), 750);
		}
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

	const elapsedMs = snapshot.gameStartedAt ? Date.now() - snapshot.gameStartedAt : 0;
	const elapsedSecs = Math.floor(elapsedMs / 1000);
	const elapsedDisplay = elapsedMs > 0
		? `${Math.floor(elapsedSecs / 60)}:${String(elapsedSecs % 60).padStart(2, '0')}`
		: '—';

	const sortedPlayers = [...snapshot.players].sort((a, b) => b.points - a.points);

	const handleReplay = () => {
		replaySudokuRoom(tree, snapshot.difficulty, snapshot.gameMode);
		setGamePhase('playing');
		setVictoryConfetti([]);
		victoryFiredRef.current = false;
		prevCellValuesRef.current = [];
	};

	const handleGoHome = () => {
		window.location.href = window.location.origin + window.location.pathname;
	};

	return (
		<div
			className="min-h-screen"
			style={{
				background: `linear-gradient(135deg, ${P.bgFrom} 0%, ${P.bgVia} 50%, ${P.bgTo} 100%)`,
				fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
				color: P.text,
			}}
		>
			{/* Victory overlay */}
			{gamePhase === 'complete' && (
				<div
					className="fixed inset-0 flex flex-col items-center justify-center z-50"
					style={{
						background: 'rgba(245,240,232,0.92)',
						backdropFilter: 'blur(28px) saturate(1.5)',
					}}
				>
					{/* Full-screen confetti rain */}
					{victoryConfetti.map((p) => (
						<span
							key={p.id}
							className="victory-confetti"
							style={{
								left: `${p.left}vw`,
								width: p.width,
								height: p.height,
								borderRadius: p.radius,
								background: p.color,
								border: p.borderColor ? `1.5px solid ${p.borderColor}` : undefined,
								animationDuration: `${p.duration}ms`,
								animationDelay: `${p.delay}ms`,
								['--drift' as string]: `${p.drift}px`,
								['--spin' as string]: `${p.spin}deg`,
							}}
						/>
					))}

					{/* Victory card */}
					<div
						className="relative z-10 flex flex-col items-center gap-6 rounded-3xl px-12 py-10 text-center"
						style={{
							background: 'rgba(255,252,247,0.80)',
							backdropFilter: 'blur(20px)',
							border: '1px solid rgba(220,210,195,0.5)',
							boxShadow: '0 24px 80px rgba(0,0,0,0.10)',
							maxWidth: 440,
							width: '90vw',
						}}
					>
						<div className="text-5xl">🎉</div>
						<div>
							<h1
								className="text-3xl font-bold tracking-tight mb-1"
								style={{ color: P.text, letterSpacing: '-0.03em' }}
							>
								Congratulations!
							</h1>
							<p className="text-[14px]" style={{ color: P.text3 }}>
								Puzzle solved
								{snapshot.gameStartedAt ? ` in ${elapsedDisplay}` : ''}
							</p>
						</div>

						{/* Scoreboard */}
						{sortedPlayers.length > 0 && (
							<div className="w-full">
								<div
									className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2 text-left"
									style={{ color: P.text3 }}
								>
									Final Score
								</div>
								<ul className="space-y-1 w-full">
									{sortedPlayers.map((player, rank) => {
										const origIdx = snapshot.players.findIndex((p) => p.id === player.id);
										const color = pc(origIdx >= 0 ? origIdx : rank);
										const isMe = player.id === me.id;
										return (
											<li
												key={player.id}
												className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
												style={{
													background: rank === 0 ? 'rgba(240,179,64,0.10)' : 'rgba(0,0,0,0.03)',
													border: rank === 0 ? '1px solid rgba(240,179,64,0.22)' : '1px solid transparent',
												}}
											>
												<div className="flex items-center gap-2.5">
													<span className="text-[13px] w-4 text-center" style={{ color: P.text3 }}>
														{rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}`}
													</span>
													<span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
													<span className="text-[13px] font-medium" style={{ color: P.text }}>
														{player.name}
														{isMe && <span className="ml-1 text-[11px] font-normal" style={{ color: P.text3 }}>you</span>}
													</span>
												</div>
												<span className="text-[13px] font-semibold tabular-nums" style={{ color }}>
													{player.points >= 0 ? '+' : ''}{player.points}
												</span>
											</li>
										);
									})}
								</ul>
							</div>
						)}

						{/* Buttons */}
						<div className="flex gap-3 w-full">
							<button
								type="button"
								onClick={handleGoHome}
								className="flex-1 rounded-2xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-150"
								style={{
									background: 'transparent',
									border: `1.5px solid ${P.accentBorder}`,
									color: P.text2,
								}}
							>
								Go Home
							</button>
							<button
								type="button"
								onClick={handleReplay}
								className="flex-1 rounded-2xl px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-150"
								style={{
									background: `linear-gradient(135deg, ${P.accent}, #a08665)`,
									boxShadow: `0 2px 12px rgba(139,115,85,0.3)`,
								}}
							>
								Play Again ↻
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="mx-auto max-w-5xl px-5 pt-6 pb-20 flex flex-col gap-5">

				{/* Header */}
				<header className="flex items-start justify-between gap-4">
					<div>
						<h1 className="text-base font-bold tracking-tight" style={{ color: P.text, letterSpacing: "-0.02em" }}>
							{isCo ? "Classic Co-Sudoku" : "Collaborative Sudoku"}
						</h1>
						<p className="mt-0.5 text-[12px] font-medium" style={{ color: P.text3 }}>
							{snapshot.difficulty.toUpperCase()} · {users.length} online
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
										const isCelebrating = confettiCells.has(index);
										const isWrong = wrongCell?.index === index;
										const solverColorIdx = cell.solvedBy ? (playerIndexMap.get(cell.solvedBy) ?? -1) : -1;
										const solverColor = solverColorIdx >= 0 ? pc(solverColorIdx) : null;
										// Use wrongCell value as display override during fade animation
										const effectiveDisplayValue = isWrong ? wrongCell!.value : displayValue;
										if (isSelected)                    { bg = myColor;    textColor = "#fff"; fontWeight = 700; }
										else if (lockedByOther)            { bg = `${lockerColor}15`; textColor = lockerColor; fontWeight = 600; outline = `2px solid ${lockerColor}40`; }
										else if (lockedByMe)               { bg = `${myColor}15`; textColor = myColor; fontWeight = 600; outline = `2px solid ${myColor}40`; }
										else if (isHighlightOriginCell)    { bg = "#ede8e0"; textColor = P.text; fontWeight = 700; }
										else if (isNumberMatch)            { bg = "#f2ede6"; textColor = P.text; fontWeight = 700; }
										else if (isRowColHighlight)        { bg = "#f7f3ee"; textColor = cell.fixed ? P.text : cell.value !== 0 ? (solverColor ?? P.text) : "rgba(0,0,0,0.08)"; fontWeight: cell.fixed || cell.value !== 0 ? 600 : 400; }
										else if (cell.fixed)               { bg = P.cellFixed; textColor = highlightOrigin !== null ? P.text : P.text2; fontWeight = 600; }
										else if (pendingValue !== null)     { bg = P.cellEmpty; textColor = isCo ? myColor : P.accent; fontWeight = 700; }
										else if (cell.value !== 0)         { bg = P.cellEmpty; textColor = solverColor ?? P.text; fontWeight = 600; }
										else if (isWrong)                  { bg = P.cellEmpty; textColor = isCo ? myColor : P.accent; fontWeight = 700; }
										else                               { bg = P.cellEmpty; textColor = "rgba(0,0,0,0.08)"; }

										return (
											<button
												key={index}
												type="button"
												data-testid={`cell-${index}`}
												data-cell-index={index}
												data-fixed={cell.fixed ? "true" : "false"}
												onClick={() => handleCellClick(index)}
												className={`aspect-square flex items-center justify-center relative${isWrong ? " cell-wrong" : ""}`}
												style={{
													background: bg,
													color: textColor,
													transition: "background 100ms ease, color 500ms ease-out",
													borderRight: borderR,
													borderBottom: borderB,
													fontSize: "clamp(14px, 2.4vw, 20px)",
													fontWeight,
													cursor: isEditable && !lockedByOther ? "pointer" : "default",
													fontVariantNumeric: "tabular-nums",
													letterSpacing: "-0.01em",
													outline,
													outlineOffset: "-2px",
													overflow: "hidden",
												}}
											>
												<span className={isCelebrating ? "cell-celebrate-number" : isWrong ? "cell-wrong-number" : undefined}>
													{effectiveDisplayValue ?? ""}
												</span>
												{/* Confetti particles */}
												{isCelebrating && confettiCells.get(index)!.map((p) => (
													<span
														key={p.id}
														className="confetti-particle"
														style={{
															left: `${p.left}%`,
															top: `${p.top}%`,
															width: p.width,
															height: p.height,
															borderRadius: p.radius,
															background: p.color,
															border: p.borderColor ? `1.5px solid ${p.borderColor}` : undefined,
															animationDuration: `${p.duration}ms`,
															animationDelay: `${p.delay}ms`,
															['--dx' as string]: `${p.dx}px`,
															['--dy' as string]: `${p.dy}px`,
															['--spin' as string]: `${p.spin}deg`,
														}}
													/>
												))}
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
									<span className="ml-1.5 text-[10px] font-normal opacity-70">↵</span>
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
						</div>
					</form>

					{/* ── Unified sidebar ──────────── */}
					<aside
						className="rounded-3xl p-5 self-start flex flex-col gap-4"
						style={glassBoldCard}
					>
						{/* Turn / mode indicator */}
						{isCo ? (
							<>
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
							</div>
							<div
								className="rounded-2xl px-4 py-3"
								style={{
									background: "rgba(0,0,0,0.02)",
									border: `1px solid rgba(0,0,0,0.04)`,
								}}
							>
								<p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: P.text3 }}>
									How To Win
								</p>
								<p className="text-[11px] leading-relaxed" style={{ color: P.text2 }}>
									We win together — pick up points (and friends) along the way.
								</p>
								<p className="text-[11px] mt-1.5" style={{ color: P.text3 }}>
									Correct +1 · Incorrect −1
								</p>
							</div>
							</>
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
