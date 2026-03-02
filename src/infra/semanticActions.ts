export type SemanticItemInput = {
	id?: string;
	text: string;
	done?: boolean;
	author?: string;
};

export type SemanticAction =
	| { type: "update_title"; title: string }
	| { type: "replace_items"; items: SemanticItemInput[] }
	| { type: "add_item"; item: SemanticItemInput }
	| { type: "toggle_item"; id: string };

export type LegacySemanticSuggestion = {
	title?: string;
	items?: SemanticItemInput[];
};

export type SemanticSnapshotItem = {
	id: string;
	text: string;
	done: boolean;
	author?: string;
};

export type SemanticSnapshot = {
	title: string;
	items: SemanticSnapshotItem[];
};

export type SemanticItemChange = {
	id: string;
	before: SemanticSnapshotItem;
	after: SemanticSnapshotItem;
};

export type SemanticPreviewDiff = {
	before: SemanticSnapshot;
	after: SemanticSnapshot;
	titleChanged: boolean;
	addedItems: SemanticSnapshotItem[];
	removedItems: SemanticSnapshotItem[];
	changedItems: SemanticItemChange[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

function parseItem(value: unknown): SemanticItemInput | undefined {
	if (!isRecord(value) || !isString(value.text)) {
		return undefined;
	}

	const item: SemanticItemInput = {
		text: value.text,
	};

	if (isString(value.id) && value.id.trim().length > 0) {
		item.id = value.id;
	}

	if (isBoolean(value.done)) {
		item.done = value.done;
	}

	if (isString(value.author)) {
		item.author = value.author;
	}

	return item;
}

function parseAction(value: unknown): SemanticAction | undefined {
	if (!isRecord(value) || !isString(value.type)) {
		return undefined;
	}

	switch (value.type) {
		case "update_title": {
			if (!isString(value.title)) {
				return undefined;
			}
			return { type: "update_title", title: value.title };
		}
		case "replace_items": {
			if (!Array.isArray(value.items)) {
				return undefined;
			}
			const items = value.items
				.map(parseItem)
				.filter((item): item is SemanticItemInput => !!item);
			if (items.length !== value.items.length) {
				return undefined;
			}
			return { type: "replace_items", items };
		}
		case "add_item": {
			const item = parseItem(value.item);
			if (!item) {
				return undefined;
			}
			return { type: "add_item", item };
		}
		case "toggle_item": {
			if (!isString(value.id)) {
				return undefined;
			}
			return { type: "toggle_item", id: value.id };
		}
		default:
			return undefined;
	}
}

export function actionsFromLegacySuggestion(
	suggestion: LegacySemanticSuggestion
): SemanticAction[] {
	const actions: SemanticAction[] = [];

	if (typeof suggestion.title === "string") {
		actions.push({ type: "update_title", title: suggestion.title });
	}

	if (Array.isArray(suggestion.items)) {
		actions.push({ type: "replace_items", items: suggestion.items });
	}

	return actions;
}

export function parseSemanticActions(payload: unknown): SemanticAction[] {
	if (Array.isArray(payload)) {
		return payload.map(parseAction).filter((action): action is SemanticAction => !!action);
	}

	if (!isRecord(payload)) {
		return [];
	}

	if (Array.isArray(payload.actions)) {
		return payload.actions
			.map(parseAction)
			.filter((action): action is SemanticAction => !!action);
	}

	const title = isString(payload.title) ? payload.title : undefined;
	const items = Array.isArray(payload.items)
		? payload.items.map(parseItem).filter((item): item is SemanticItemInput => !!item)
		: undefined;

	if (!title && !items) {
		return [];
	}

	return actionsFromLegacySuggestion({ title, items });
}

export function describeSemanticAction(action: SemanticAction): string {
	switch (action.type) {
		case "update_title":
			return `Update title to "${action.title}"`;
		case "replace_items":
			return `Replace checklist with ${action.items.length} item${action.items.length === 1 ? "" : "s"}`;
		case "add_item":
			return `Add item "${action.item.text}"`;
		case "toggle_item":
			return `Toggle completion for item ${action.id}`;
	}
}

function cloneItem(item: SemanticSnapshotItem): SemanticSnapshotItem {
	return {
		id: item.id,
		text: item.text,
		done: item.done,
		author: item.author,
	};
}

export function projectSemanticActions(
	base: SemanticSnapshot,
	actions: SemanticAction[]
): SemanticSnapshot {
	let title = base.title;
	let items = base.items.map(cloneItem);
	let syntheticIdCounter = 0;

	for (const action of actions) {
		switch (action.type) {
			case "update_title":
				title = action.title;
				break;
			case "replace_items":
				items = action.items.map((item) => ({
					id: item.id ?? `preview-new-${syntheticIdCounter++}`,
					text: item.text,
					done: item.done ?? false,
					author: item.author,
				}));
				break;
			case "add_item":
				items.push({
					id: action.item.id ?? `preview-new-${syntheticIdCounter++}`,
					text: action.item.text,
					done: action.item.done ?? false,
					author: action.item.author,
				});
				break;
			case "toggle_item": {
				const targetIndex = items.findIndex((item) => item.id === action.id);
				if (targetIndex !== -1) {
					items[targetIndex] = {
						...items[targetIndex],
						done: !items[targetIndex].done,
					};
				}
				break;
			}
		}
	}

	return { title, items };
}

export function createSemanticPreviewDiff(
	before: SemanticSnapshot,
	actions: SemanticAction[]
): SemanticPreviewDiff {
	const after = projectSemanticActions(before, actions);

	const beforeMap = new Map(before.items.map((item) => [item.id, item]));
	const afterMap = new Map(after.items.map((item) => [item.id, item]));

	const addedItems = after.items.filter((item) => !beforeMap.has(item.id));
	const removedItems = before.items.filter((item) => !afterMap.has(item.id));

	const changedItems: SemanticItemChange[] = [];
	for (const afterItem of after.items) {
		const beforeItem = beforeMap.get(afterItem.id);
		if (!beforeItem) {
			continue;
		}
		if (
			beforeItem.text !== afterItem.text ||
			beforeItem.done !== afterItem.done ||
			beforeItem.author !== afterItem.author
		) {
			changedItems.push({
				id: afterItem.id,
				before: beforeItem,
				after: afterItem,
			});
		}
	}

	return {
		before,
		after,
		titleChanged: before.title !== after.title,
		addedItems,
		removedItems,
		changedItems,
	};
}
