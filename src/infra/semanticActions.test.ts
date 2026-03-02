import { describe, expect, it } from "vitest";
import {
	actionsFromLegacySuggestion,
	createSemanticPreviewDiff,
	parseSemanticActions,
	projectSemanticActions,
} from "./semanticActions";

describe("semanticActions", () => {
	it("parses action envelope payload", () => {
		const actions = parseSemanticActions({
			actions: [
				{ type: "update_title", title: "My App" },
				{ type: "add_item", item: { text: "Task A", done: false } },
			],
		});

		expect(actions).toHaveLength(2);
		expect(actions[0]).toEqual({ type: "update_title", title: "My App" });
	});

	it("maps legacy suggestion into actions", () => {
		const actions = actionsFromLegacySuggestion({
			title: "Renamed",
			items: [{ text: "One", done: false }],
		});

		expect(actions).toHaveLength(2);
		expect(actions[0].type).toBe("update_title");
		expect(actions[1].type).toBe("replace_items");
	});

	it("projects actions and computes diff", () => {
		const before = {
			title: "Starter",
			items: [
				{ id: "1", text: "One", done: false },
				{ id: "2", text: "Two", done: false },
			],
		};

		const actions = [
			{ type: "update_title", title: "Updated" } as const,
			{ type: "toggle_item", id: "1" } as const,
			{ type: "add_item", item: { id: "3", text: "Three", done: false } } as const,
		];

		const after = projectSemanticActions(before, actions);
		expect(after.title).toBe("Updated");
		expect(after.items).toHaveLength(3);
		expect(after.items.find((item) => item.id === "1")?.done).toBe(true);

		const diff = createSemanticPreviewDiff(before, actions);
		expect(diff.titleChanged).toBe(true);
		expect(diff.addedItems).toHaveLength(1);
		expect(diff.changedItems).toHaveLength(1);
	});
});
