import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";
import { TreeViewConfiguration, TreeView } from "@fluidframework/tree";

const sf = new SchemaFactoryAlpha("8e2f6e9a-2d5a-4c43-8b11-7cf5f5c60f4f");

export class Item extends sf.object("Item", {
	id: sf.string,
	text: sf.string,
	done: sf.required(sf.boolean, { metadata: { description: "Whether the item is complete" } }),
	author: sf.optional(sf.string),
	updatedAt: sf.optional(sf.number),
}) {}

export class Items extends sf.array("Items", Item) {}

export class SemanticEditLogEntry extends sf.object("SemanticEditLogEntry", {
	id: sf.string,
	createdAt: sf.number,
	actor: sf.optional(sf.string),
	actionsJson: sf.string,
	beforeSnapshotJson: sf.string,
	afterSnapshotJson: sf.string,
}) {}

export class SemanticEditLog extends sf.array("SemanticEditLog", SemanticEditLogEntry) {}

export class SudokuCell extends sf.object("SudokuCell", {
	value: sf.number,
	fixed: sf.boolean,
	lockedBy: sf.optional(sf.string),
	lockedByName: sf.optional(sf.string),
	solvedBy: sf.optional(sf.string),
}) {}

export class SudokuCells extends sf.array("SudokuCells", SudokuCell) {}

export class SudokuPlayer extends sf.object("SudokuPlayer", {
	id: sf.string,
	name: sf.string,
	points: sf.number,
}) {}

export class SudokuPlayers extends sf.array("SudokuPlayers", SudokuPlayer) {}

export class AppModel extends sf.object("AppModel", {
	title: sf.string,
	items: Items,
	semanticEditLog: sf.optional(SemanticEditLog),
	sudokuCells: SudokuCells,
	sudokuSolution: sf.string,
	currentTurnPlayerId: sf.optional(sf.string),
	sudokuPlayers: SudokuPlayers,
	lastValidationMessage: sf.optional(sf.string),
	sudokuDifficulty: sf.optional(sf.string),
	roomAdminId: sf.optional(sf.string),
	roomAdminName: sf.optional(sf.string),
	gameMode: sf.optional(sf.string),
	gameStartedAt: sf.optional(sf.number),
}) {}

export const starterTreeConfiguration = new TreeViewConfiguration({ schema: AppModel });

export type StarterTreeView = TreeView<typeof AppModel>;

export function getDefaultStarterContent(): AppModel {
	const starterPuzzle =
		"530070000600195000098000060800060003400803001700020006060000280000419005000080079";
	const starterSolution =
		"534678912672195348198342567859761423426853791713924856961537284287419635345286179";
	const starterCells = starterPuzzle.split("").map(
		(char) =>
			new SudokuCell({
				value: Number(char),
				fixed: char !== "0",
			})
	);

	return new AppModel({
		title: "Fluid Starter",
		items: new Items([]),
		semanticEditLog: new SemanticEditLog([]),
		sudokuCells: new SudokuCells(starterCells),
		sudokuSolution: starterSolution,
		currentTurnPlayerId: undefined,
		sudokuPlayers: new SudokuPlayers([]),
		lastValidationMessage: undefined,
		sudokuDifficulty: "easy",
		roomAdminId: undefined,
		roomAdminName: undefined,
	});
}
