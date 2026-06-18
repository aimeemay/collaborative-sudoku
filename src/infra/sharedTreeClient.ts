import { AzureClient, IAzureAudience } from "@fluidframework/azure-client";
import { IFluidContainer, Tree } from "fluid-framework";
import { loadFluidData } from "./fluid.js";
import { containerSchema } from "../schema/containerSchema.js";
import {
	starterTreeConfiguration,
	getDefaultStarterContent,
	StarterTreeView,
	AppModel,
	Items,
	Item,
	SemanticEditLog,
	SemanticEditLogEntry,
	SudokuCell,
	SudokuCells,
	SudokuPlayer,
	SudokuPlayers,
} from "../schema/starterSchema.js";
import { SemanticAction } from "./semanticActions.js";
import { generateSudoku, SudokuDifficulty } from "../utils/sudokuGenerator.js";

export type StarterContainerAssets = {
	container: IFluidContainer<typeof containerSchema>;
	tree: StarterTreeView;
	audience: IAzureAudience;
};

export async function loadStarterContainer(props: {
	client: AzureClient;
	containerId: string;
}): Promise<StarterContainerAssets> {
	const { client, containerId } = props;
	const { container, services } = await loadFluidData(containerId, containerSchema, client);

	const tree = container.initialObjects.appData.viewWith(starterTreeConfiguration);
	if (tree.compatibility.canInitialize) {
		tree.initialize(getDefaultStarterContent());
	}

	return { container, tree, audience: services.audience };
}

export function addItem(tree: StarterTreeView, text: string, author?: string): void {
	insertItem(tree, {
		id: crypto.randomUUID(),
		text,
		done: false,
		author,
		updatedAt: Date.now(),
	});
}

function insertItem(
	tree: StarterTreeView,
	data: { id: string; text: string; done: boolean; author?: string; updatedAt?: number }
): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		const newItem = new Item({
			id: data.id,
			text: data.text,
			done: data.done,
			author: data.author,
			updatedAt: data.updatedAt ?? Date.now(),
		});
		root.items.insertAtEnd(newItem);
	});
}

export function toggleItem(tree: StarterTreeView, id: string): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		const targetIndex = root.items.findIndex((item) => item.id === id);
		if (targetIndex === -1) {
			return;
		}
		const existing = root.items[targetIndex];
		root.items.removeAt(targetIndex);
		root.items.insertAt(
			targetIndex,
			new Item({
				...existing,
				done: !existing.done,
				updatedAt: Date.now(),
			})
		);
	});
}

export function updateTitle(tree: StarterTreeView, title: string): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		root.title = title;
	});
}

export function replaceItems(tree: StarterTreeView, items: Item[]): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		root.items = new Items(items);
	});
}

export type StarterSnapshot = Pick<AppModel, "title" | "items">;

export type SerializableSnapshotItem = {
	id: string;
	text: string;
	done: boolean;
	author?: string;
	updatedAt?: number;
};

export type SerializableSnapshot = {
	title: string;
	items: SerializableSnapshotItem[];
};

export type SemanticAuditEntry = {
	id: string;
	createdAt: number;
	actor?: string;
	actions: SemanticAction[];
	before: SerializableSnapshot;
	after: SerializableSnapshot;
};

export function getSnapshot(tree: StarterTreeView): StarterSnapshot {
	const root = requireRoot(tree);
	return {
		title: root.title,
		items: root.items,
	};
}

export function getSerializableSnapshot(tree: StarterTreeView): SerializableSnapshot {
	const root = requireRoot(tree);
	return {
		title: root.title,
		items: root.items.map((item) => ({
			id: item.id,
			text: item.text,
			done: item.done,
			author: item.author,
			updatedAt: item.updatedAt,
		})),
	};
}

function restoreSnapshot(tree: StarterTreeView, snapshot: SerializableSnapshot): void {
	updateTitle(tree, snapshot.title);
	const nextItems = snapshot.items.map(
		(item) =>
			new Item({
				id: item.id,
				text: item.text,
				done: item.done,
				author: item.author,
				updatedAt: item.updatedAt ?? Date.now(),
			})
	);
	replaceItems(tree, nextItems);
}

function ensureSemanticEditLog(root: AppModel): SemanticEditLog {
	if (!root.semanticEditLog) {
		root.semanticEditLog = new SemanticEditLog([]);
	}
	return root.semanticEditLog;
}

function parseAuditEntry(entry: SemanticEditLogEntry): SemanticAuditEntry | undefined {
	try {
		return {
			id: entry.id,
			createdAt: entry.createdAt,
			actor: entry.actor,
			actions: JSON.parse(entry.actionsJson) as SemanticAction[],
			before: JSON.parse(entry.beforeSnapshotJson) as SerializableSnapshot,
			after: JSON.parse(entry.afterSnapshotJson) as SerializableSnapshot,
		};
	} catch {
		return undefined;
	}
}

export function getSemanticAuditEntries(tree: StarterTreeView): SemanticAuditEntry[] {
	const root = requireRoot(tree);
	if (!root.semanticEditLog) {
		return [];
	}

	return root.semanticEditLog
		.map(parseAuditEntry)
		.filter((entry): entry is SemanticAuditEntry => !!entry)
		.sort((a, b) => b.createdAt - a.createdAt);
}

export function applySemanticActions(tree: StarterTreeView, actions: SemanticAction[]): void {
	for (const action of actions) {
		switch (action.type) {
			case "update_title":
				updateTitle(tree, action.title);
				break;
			case "replace_items": {
				const nextItems = action.items.map(
					(item) =>
						new Item({
							id: item.id ?? crypto.randomUUID(),
							text: item.text,
							done: item.done ?? false,
							author: item.author,
							updatedAt: Date.now(),
						})
				);
				replaceItems(tree, nextItems);
				break;
			}
			case "add_item":
				insertItem(tree, {
					id: action.item.id ?? crypto.randomUUID(),
					text: action.item.text,
					done: action.item.done ?? false,
					author: action.item.author,
					updatedAt: Date.now(),
				});
				break;
			case "toggle_item":
				toggleItem(tree, action.id);
				break;
		}
	}
}

export function applySemanticActionsWithAudit(
	tree: StarterTreeView,
	actions: SemanticAction[],
	actor?: string
): { auditId: string } | undefined {
	if (actions.length === 0) {
		return undefined;
	}

	const before = getSerializableSnapshot(tree);
	applySemanticActions(tree, actions);
	const after = getSerializableSnapshot(tree);
	const auditId = crypto.randomUUID();

	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		const log = ensureSemanticEditLog(root);
		log.insertAtEnd(
			new SemanticEditLogEntry({
				id: auditId,
				createdAt: Date.now(),
				actor,
				actionsJson: JSON.stringify(actions),
				beforeSnapshotJson: JSON.stringify(before),
				afterSnapshotJson: JSON.stringify(after),
			})
		);
	});

	return { auditId };
}

export function rollbackSemanticEdit(tree: StarterTreeView, auditId: string): boolean {
	const root = requireRoot(tree);
	if (!root.semanticEditLog) {
		return false;
	}

	const targetIndex = root.semanticEditLog.findIndex((entry) => entry.id === auditId);
	if (targetIndex === -1) {
		return false;
	}

	const parsed = parseAuditEntry(root.semanticEditLog[targetIndex]);
	if (!parsed) {
		return false;
	}

	restoreSnapshot(tree, parsed.before);

	Tree.runTransaction(root, () => {
		const log = ensureSemanticEditLog(root);
		log.insertAtEnd(
			new SemanticEditLogEntry({
				id: crypto.randomUUID(),
				createdAt: Date.now(),
				actor: parsed.actor,
				actionsJson: JSON.stringify([{ type: "rollback", targetAuditId: auditId }]),
				beforeSnapshotJson: JSON.stringify(parsed.after),
				afterSnapshotJson: JSON.stringify(parsed.before),
			})
		);
	});

	return true;
}

export type SudokuSnapshot = {
	cells: Array<{ value: number; fixed: boolean; lockedBy?: string; lockedByName?: string; solvedBy?: string }>;
	solution: string;
	players: Array<{ id: string; name: string; points: number }>;
	currentTurnPlayerId?: string;
	lastValidationMessage?: string;
	difficulty: SudokuDifficulty;
	roomAdminId?: string;
	roomAdminName?: string;
	gameMode: "classic" | "cosudoku";
	gameStartedAt?: number;
	turnTimerStarted: boolean;
	timerPaused: boolean;
};

export type SubmitSudokuMoveResult = {
	committed: boolean;
	message: string;
	nextPlayerId?: string;
};

export function getSudokuSnapshot(tree: StarterTreeView): SudokuSnapshot {
	const root = requireRoot(tree);
	return {
		cells: root.sudokuCells.map((cell) => ({
			value: cell.value,
			fixed: cell.fixed,
			lockedBy: cell.lockedBy,
			lockedByName: cell.lockedByName,
			solvedBy: cell.solvedBy,
		})),
		solution: root.sudokuSolution,
		players: root.sudokuPlayers.map((player) => ({
			id: player.id,
			name: player.name,
			points: player.points,
		})),
		currentTurnPlayerId: root.currentTurnPlayerId,
		lastValidationMessage: root.lastValidationMessage,
		difficulty: normalizeDifficulty(root.sudokuDifficulty),
		roomAdminId: root.roomAdminId,
		roomAdminName: root.roomAdminName,
		gameMode: root.gameMode === "cosudoku" ? "cosudoku" : "classic",
		gameStartedAt: root.gameStartedAt,
		turnTimerStarted: root.turnTimerStarted === true,
		timerPaused: root.timerPaused === true,
	};
}

export function initializeGeneratedSudokuRoom(
	tree: StarterTreeView,
	difficulty: SudokuDifficulty,
	gameMode: "classic" | "cosudoku" = "classic"
): void {
	const root = requireRoot(tree);
	const generated = generateSudoku(difficulty);

	Tree.runTransaction(root, () => {
		root.sudokuCells = new SudokuCells(
			generated.puzzle.split("").map(
				(char) =>
					new SudokuCell({
						value: Number(char),
						fixed: char !== "0",
					})
			)
		);
		root.sudokuSolution = generated.solution;
		root.sudokuDifficulty = generated.difficulty;
		root.sudokuPlayers = new SudokuPlayers([]);
		root.currentTurnPlayerId = undefined;
		root.lastValidationMessage = undefined;
		root.gameMode = gameMode;
		root.gameStartedAt = Date.now();
	});
}

/** Replay in the same room: fresh puzzle, same players with reset scores. */
export function replaySudokuRoom(
	tree: StarterTreeView,
	difficulty: SudokuDifficulty,
	gameMode: "classic" | "cosudoku" = "classic"
): void {
	const root = requireRoot(tree);
	const generated = generateSudoku(difficulty);

	Tree.runTransaction(root, () => {
		root.sudokuCells = new SudokuCells(
			generated.puzzle.split("").map(
				(char) =>
					new SudokuCell({
						value: Number(char),
						fixed: char !== "0",
					})
			)
		);
		root.sudokuSolution = generated.solution;
		root.sudokuDifficulty = generated.difficulty;
		root.gameMode = gameMode;
		root.lastValidationMessage = undefined;
		root.gameStartedAt = Date.now();

		// Reset scores but keep players
		const resetPlayers = root.sudokuPlayers.map((p) =>
			new SudokuPlayer({ id: p.id, name: p.name, points: 0 })
		);
		root.sudokuPlayers = new SudokuPlayers(resetPlayers);

		// Give turn to first player
		root.currentTurnPlayerId = root.sudokuPlayers[0]?.id;
	});
}

export function claimAdminRole(tree: StarterTreeView, playerId: string, playerName: string): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		root.roomAdminId = playerId;
		root.roomAdminName = playerName;
	});
}

export function isNameTaken(tree: StarterTreeView, name: string, excludeId?: string): boolean {
	const root = requireRoot(tree);
	const normalized = name.trim().toLowerCase();
	return root.sudokuPlayers.some(
		(p) => p.name.trim().toLowerCase() === normalized && p.id !== excludeId
	);
}

export function initializeRoomAdmin(
	tree: StarterTreeView,
	admin: { id: string; name: string }
): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		if (!root.roomAdminId) {
			root.roomAdminId = admin.id;
			root.roomAdminName = admin.name;
		}
	});
}

export function registerSudokuPlayer(tree: StarterTreeView, id: string, name: string): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		if (root.roomAdminId === id && root.roomAdminName !== name) {
			root.roomAdminName = name;
		}

		const existingIndex = root.sudokuPlayers.findIndex((player) => player.id === id);
		if (existingIndex === -1) {
			root.sudokuPlayers.insertAtEnd(
				new SudokuPlayer({
					id,
					name,
					points: 0,
				})
			);
		} else if (root.sudokuPlayers[existingIndex].name !== name) {
			const existing = root.sudokuPlayers[existingIndex];
			root.sudokuPlayers.removeAt(existingIndex);
			root.sudokuPlayers.insertAt(
				existingIndex,
				new SudokuPlayer({
					id: existing.id,
					name,
					points: existing.points,
				})
			);
		}

		if (!root.currentTurnPlayerId && root.sudokuPlayers.length > 0) {
			root.currentTurnPlayerId = root.sudokuPlayers[0].id;
		}
	});
}

export function submitSudokuMoveAndPassTurn(
	tree: StarterTreeView,
	move: {
		playerId: string;
		playerName: string;
		cellIndex: number;
		value: number;
	}
): SubmitSudokuMoveResult {
	const root = requireRoot(tree);
	let result: SubmitSudokuMoveResult = {
		committed: false,
		message: "Move was not processed.",
		nextPlayerId: root.currentTurnPlayerId,
	};

	Tree.runTransaction(root, () => {
		ensureSudokuPlayer(root, move.playerId, move.playerName);
		if (!root.currentTurnPlayerId && root.sudokuPlayers.length > 0) {
			root.currentTurnPlayerId = root.sudokuPlayers[0].id;
		}

		if (root.currentTurnPlayerId !== move.playerId) {
			result = {
				committed: false,
				message: "It is not your turn.",
				nextPlayerId: root.currentTurnPlayerId,
			};
			return;
		}

		const validation = validateSudokuMove(root, move.cellIndex, move.value);
		if (!validation.ok) {
			if (validation.isWrongAnswer) {
				const playerIndex = root.sudokuPlayers.findIndex((p) => p.id === move.playerId);
				if (playerIndex >= 0) {
					const player = root.sudokuPlayers[playerIndex];
					root.sudokuPlayers.removeAt(playerIndex);
					root.sudokuPlayers.insertAt(
						playerIndex,
						new SudokuPlayer({ id: player.id, name: player.name, points: player.points - 1 })
					);
				}
			}
			root.lastValidationMessage = validation.message;
			if (!root.turnTimerStarted) root.turnTimerStarted = true;
			const nextPlayerId = passTurn(root, move.playerId);
			result = {
				committed: false,
				message: validation.message,
				nextPlayerId,
			};
			return;
		}

		const existingCell = root.sudokuCells[move.cellIndex];
		root.sudokuCells.removeAt(move.cellIndex);
		root.sudokuCells.insertAt(
			move.cellIndex,
			new SudokuCell({ value: move.value, fixed: existingCell.fixed, solvedBy: move.playerId })
		);

		const playerIndex = root.sudokuPlayers.findIndex((player) => player.id === move.playerId);
		if (playerIndex >= 0) {
			const player = root.sudokuPlayers[playerIndex];
			root.sudokuPlayers.removeAt(playerIndex);
			root.sudokuPlayers.insertAt(
				playerIndex,
				new SudokuPlayer({
					id: player.id,
					name: player.name,
					points: player.points + 1,
				})
			);
		}

		if (!root.turnTimerStarted) root.turnTimerStarted = true;
		root.lastValidationMessage = "Move accepted and committed.";
		const nextPlayerId = passTurn(root, move.playerId);
		result = {
			committed: true,
			message: root.lastValidationMessage,
			nextPlayerId,
		};
	});

	return result;
}

/**
 * Internal: removes a player from the roster, unlocking their cells and advancing
 * the turn if it was theirs. Does NOT touch the admin role — admin succession is
 * intentionally not part of this design (the admin is the always-on room host).
 */
function removePlayerInternal(root: AppModel, playerId: string): void {
	const index = root.sudokuPlayers.findIndex((player) => player.id === playerId);
	if (index === -1) {
		return;
	}

	// Unlock any cells held by the leaving player
	for (let j = 0; j < root.sudokuCells.length; j++) {
		const cell = root.sudokuCells[j];
		if (cell.lockedBy === playerId) {
			root.sudokuCells.removeAt(j);
			root.sudokuCells.insertAt(j, new SudokuCell({ value: cell.value, fixed: cell.fixed }));
		}
	}

	root.sudokuPlayers.removeAt(index);

	if (root.currentTurnPlayerId === playerId) {
		root.currentTurnPlayerId = root.sudokuPlayers.length > 0
			? root.sudokuPlayers[Math.min(index, root.sudokuPlayers.length - 1)].id
			: undefined;
	}
}

/**
 * Removes a single non-admin player from their own client (e.g. on "Go Home" or
 * tab close) so departures feel instant rather than waiting for the audience
 * disconnect signal. Admins are not removed — by design the admin role is never
 * passed on.
 */
export function leaveSudokuRoom(tree: StarterTreeView, playerId: string): void {
	const root = requireRoot(tree);
	if (root.roomAdminId === playerId) {
		return;
	}
	Tree.runTransaction(root, () => {
		removePlayerInternal(root, playerId);
	});
}

export function kickSudokuPlayer(
	tree: StarterTreeView, actorId: string, targetPlayerId: string): boolean {
	const root = requireRoot(tree);
	let didKick = false;

	Tree.runTransaction(root, () => {
		if (!root.roomAdminId || root.roomAdminId !== actorId) {
			return;
		}

		if (targetPlayerId === root.roomAdminId) {
			return;
		}

		const targetIndex = root.sudokuPlayers.findIndex((player) => player.id === targetPlayerId);
		if (targetIndex === -1) {
			return;
		}

		root.sudokuPlayers.removeAt(targetIndex);

		if (root.currentTurnPlayerId === targetPlayerId) {
			if (root.sudokuPlayers.length === 0) {
				root.currentTurnPlayerId = undefined;
			} else if (targetIndex >= root.sudokuPlayers.length) {
				root.currentTurnPlayerId = root.sudokuPlayers[0].id;
			} else {
				root.currentTurnPlayerId = root.sudokuPlayers[targetIndex].id;
			}
		}

		root.lastValidationMessage = "A player was removed by the room admin.";
		didKick = true;
	});

	return didKick;
}

function ensureSudokuPlayer(root: AppModel, id: string, name: string): void {
	const existingIndex = root.sudokuPlayers.findIndex((player) => player.id === id);
	if (existingIndex === -1) {
		root.sudokuPlayers.insertAtEnd(
			new SudokuPlayer({
				id,
				name,
				points: 0,
			})
		);
		return;
	}

	const existing = root.sudokuPlayers[existingIndex];
	if (existing.name !== name) {
		root.sudokuPlayers.removeAt(existingIndex);
		root.sudokuPlayers.insertAt(
			existingIndex,
			new SudokuPlayer({
				id: existing.id,
				name,
				points: existing.points,
			})
		);
	}
}

function passTurn(root: AppModel, currentPlayerId: string): string | undefined {
	if (root.sudokuPlayers.length === 0) {
		root.currentTurnPlayerId = undefined;
		return undefined;
	}

	const currentIndex = root.sudokuPlayers.findIndex((player) => player.id === currentPlayerId);
	if (currentIndex === -1) {
		root.currentTurnPlayerId = root.sudokuPlayers[0].id;
		return root.currentTurnPlayerId;
	}

	const nextIndex = (currentIndex + 1) % root.sudokuPlayers.length;
	root.currentTurnPlayerId = root.sudokuPlayers[nextIndex].id;
	return root.currentTurnPlayerId;
}

export function passSudokuTurn(
	tree: StarterTreeView,
	playerId: string
): { passed: boolean; message: string } {
	const root = requireRoot(tree);
	let result = { passed: false, message: "Not your turn." };

	Tree.runTransaction(root, () => {
		if (root.currentTurnPlayerId !== playerId) {
			return;
		}
		const name = root.sudokuPlayers.find((p) => p.id === playerId)?.name ?? "Player";
		root.lastValidationMessage = `${name} passed.`;
		passTurn(root, playerId);
		result = { passed: true, message: root.lastValidationMessage };
	});

	return result;
}

function validateSudokuMove(
	root: AppModel,
	cellIndex: number,
	value: number
): { ok: boolean; message: string; isWrongAnswer?: boolean } {
	if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= 81) {
		return { ok: false, message: "Invalid cell selected." };
	}

	if (!Number.isInteger(value) || value < 1 || value > 9) {
		return { ok: false, message: "Enter a number from 1 to 9." };
	}

	const cell = root.sudokuCells[cellIndex];
	if (cell.fixed) {
		return { ok: false, message: "That cell is fixed and cannot be changed." };
	}

	if (cell.value !== 0) {
		return { ok: false, message: "Cell already has a committed value." };
	}

	const expected = Number(root.sudokuSolution[cellIndex]);
	if (value !== expected) {
		return { ok: false, message: "Wrong! −1 point.", isWrongAnswer: true };
	}

	const candidateValues = root.sudokuCells.map((existing, index) =>
		index === cellIndex ? value : existing.value
	);
	if (!isPlacementUnique(candidateValues, cellIndex)) {
		return { ok: false, message: "Validation failed: move breaks Sudoku rules." };
	}

	return { ok: true, message: "Valid move." };
}

function isPlacementUnique(values: number[], index: number): boolean {
	const value = values[index];
	if (value === 0) {
		return false;
	}

	const row = Math.floor(index / 9);
	const column = index % 9;

	for (let col = 0; col < 9; col += 1) {
		const rowIndex = row * 9 + col;
		if (rowIndex !== index && values[rowIndex] === value) {
			return false;
		}
	}

	for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
		const cellIndex = rowIndex * 9 + column;
		if (cellIndex !== index && values[cellIndex] === value) {
			return false;
		}
	}

	const boxStartRow = Math.floor(row / 3) * 3;
	const boxStartCol = Math.floor(column / 3) * 3;
	for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
		for (let colOffset = 0; colOffset < 3; colOffset += 1) {
			const cellRow = boxStartRow + rowOffset;
			const cellCol = boxStartCol + colOffset;
			const boxIndex = cellRow * 9 + cellCol;
			if (boxIndex !== index && values[boxIndex] === value) {
				return false;
			}
		}
	}

	return true;
}

function requireRoot(tree: StarterTreeView) {
	const root = tree.root as AppModel | undefined;
	if (!root) {
		throw new Error("SharedTree root is missing or uninitialized");
	}
	return root;
}

function normalizeDifficulty(value?: string): SudokuDifficulty {
	if (value === "medium" || value === "hard") {
		return value;
	}
	return "easy";
}

// ─── CoSudoku (collaborative simultaneous mode) ───────────────────────────

export function lockSudokuCell(
	tree: StarterTreeView,
	cellIndex: number,
	playerId: string,
	playerName: string
): boolean {
	const root = requireRoot(tree);
	let locked = false;
	Tree.runTransaction(root, () => {
		const cell = root.sudokuCells[cellIndex];
		if (!cell || cell.fixed || cell.value !== 0) return;
		if (cell.lockedBy && cell.lockedBy !== playerId) return;

		// Unlock any other cells this player holds
		for (let i = 0; i < root.sudokuCells.length; i++) {
			const c = root.sudokuCells[i];
			if (c.lockedBy === playerId && i !== cellIndex) {
				root.sudokuCells.removeAt(i);
				root.sudokuCells.insertAt(
					i,
					new SudokuCell({ value: c.value, fixed: c.fixed })
				);
			}
		}

		// Lock the target cell
		root.sudokuCells.removeAt(cellIndex);
		root.sudokuCells.insertAt(
			cellIndex,
			new SudokuCell({
				value: cell.value,
				fixed: cell.fixed,
				lockedBy: playerId,
				lockedByName: playerName,
			})
		);
		locked = true;
	});
	return locked;
}

export function unlockSudokuCell(tree: StarterTreeView, playerId: string): void {
	const root = requireRoot(tree);
	Tree.runTransaction(root, () => {
		for (let i = 0; i < root.sudokuCells.length; i++) {
			const c = root.sudokuCells[i];
			if (c.lockedBy === playerId) {
				root.sudokuCells.removeAt(i);
				root.sudokuCells.insertAt(
					i,
					new SudokuCell({ value: c.value, fixed: c.fixed })
				);
			}
		}
	});
}

export function submitCoSudokuMove(
	tree: StarterTreeView,
	move: { playerId: string; playerName: string; cellIndex: number; value: number }
): SubmitSudokuMoveResult {
	const root = requireRoot(tree);
	let result: SubmitSudokuMoveResult = { committed: false, message: "Move was not processed." };

	Tree.runTransaction(root, () => {
		ensureSudokuPlayer(root, move.playerId, move.playerName);

		const cell = root.sudokuCells[move.cellIndex];
		if (!cell || cell.fixed || cell.value !== 0) {
			result = { committed: false, message: "Cell not available." };
			return;
		}
		if (cell.lockedBy && cell.lockedBy !== move.playerId) {
			result = { committed: false, message: "Cell is locked by another player." };
			return;
		}

		const validation = validateSudokuMove(root, move.cellIndex, move.value);
		const playerIndex = root.sudokuPlayers.findIndex((p) => p.id === move.playerId);

		if (!validation.ok) {
			if (validation.isWrongAnswer && playerIndex >= 0) {
				const player = root.sudokuPlayers[playerIndex];
				root.sudokuPlayers.removeAt(playerIndex);
				root.sudokuPlayers.insertAt(
					playerIndex,
					new SudokuPlayer({ id: player.id, name: player.name, points: player.points - 1 })
				);
			}
			// Unlock the cell
			root.sudokuCells.removeAt(move.cellIndex);
			root.sudokuCells.insertAt(
				move.cellIndex,
				new SudokuCell({ value: cell.value, fixed: cell.fixed })
			);
			result = { committed: false, message: validation.message };
			return;
		}

		// Correct — place value and award point
		root.sudokuCells.removeAt(move.cellIndex);
		root.sudokuCells.insertAt(
			move.cellIndex,
			new SudokuCell({ value: move.value, fixed: false, solvedBy: move.playerId })
		);
		if (playerIndex >= 0) {
			const player = root.sudokuPlayers[playerIndex];
			root.sudokuPlayers.removeAt(playerIndex);
			root.sudokuPlayers.insertAt(
				playerIndex,
				new SudokuPlayer({ id: player.id, name: player.name, points: player.points + 1 })
			);
		}
		result = { committed: true, message: "Correct!" };
	});

	return result;
}

/** DEV ONLY — fills all empty cells with the correct solution values. */
export function devCompletePuzzle(tree: StarterTreeView, solvedById: string): void {
	const root = requireRoot(tree);
	const solution = root.sudokuSolution;
	Tree.runTransaction(root, () => {
		root.sudokuCells.map((cell, i) => ({ cell, i })).forEach(({ cell, i }) => {
			if (!cell.fixed && cell.value === 0) {
				root.sudokuCells.removeAt(i);
				root.sudokuCells.insertAt(
					i,
					new SudokuCell({ value: Number(solution[i]), fixed: false, solvedBy: solvedById })
				);
			}
		});
	});
}

export function setTurnTimerPaused(tree: StarterTreeView, adminId: string, paused: boolean): void {
	const root = requireRoot(tree);
	if (root.roomAdminId !== adminId) return;
	Tree.runTransaction(root, () => {
		root.timerPaused = paused;
	});
}
