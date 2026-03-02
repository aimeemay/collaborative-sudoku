import { AzureClient } from "@fluidframework/azure-client";
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
} from "../schema/starterSchema.js";
import { SemanticAction } from "./semanticActions.js";

export type StarterContainerAssets = {
	container: IFluidContainer<typeof containerSchema>;
	tree: StarterTreeView;
};

export async function loadStarterContainer(props: {
	client: AzureClient;
	containerId: string;
}): Promise<StarterContainerAssets> {
	const { client, containerId } = props;
	const { container } = await loadFluidData(containerId, containerSchema, client);

	const tree = container.initialObjects.appData.viewWith(starterTreeConfiguration);
	if (tree.compatibility.canInitialize) {
		tree.initialize(getDefaultStarterContent());
	}

	return { container, tree };
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

function requireRoot(tree: StarterTreeView) {
	const root = tree.root as AppModel | undefined;
	if (!root) {
		throw new Error("SharedTree root is missing or uninitialized");
	}
	return root;
}
