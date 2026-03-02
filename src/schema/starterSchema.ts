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

export class AppModel extends sf.object("AppModel", {
	title: sf.string,
	items: Items,
	semanticEditLog: sf.optional(SemanticEditLog),
}) {}

export const starterTreeConfiguration = new TreeViewConfiguration({ schema: AppModel });

export type StarterTreeView = TreeView<typeof AppModel>;

export function getDefaultStarterContent(): AppModel {
	return new AppModel({
		title: "Fluid Starter",
		items: new Items([]),
		semanticEditLog: new SemanticEditLog([]),
	});
}
