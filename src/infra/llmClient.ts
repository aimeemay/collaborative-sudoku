import { Item, StarterTreeView } from "../schema/starterSchema.js";
import { applySemanticActionsWithAudit } from "./sharedTreeClient.js";
import {
	actionsFromLegacySuggestion,
	parseSemanticActions,
	SemanticAction,
} from "./semanticActions.js";

type SemanticSuggestion = {
	title?: string;
	items?: Array<Pick<Item, "id" | "text" | "done" | "author">>;
};

type SuggestEditRequest = {
	title: string;
	items: ReadonlyArray<Item>;
};

export interface LlmClient {
	suggestEdit(input: SuggestEditRequest): Promise<SemanticAction[]>;
}

class HttpLlmClient implements LlmClient {
	constructor(private readonly endpoint: string) {}

	async suggestEdit(input: SuggestEditRequest): Promise<SemanticAction[]> {
		const response = await fetch(this.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: input.title,
				items: input.items.map((item) => ({
					id: item.id,
					text: item.text,
					done: item.done,
					author: item.author,
				})),
			}),
		});

		if (!response.ok) {
			throw new Error(`LLM endpoint returned ${response.status}`);
		}

		const data = (await response.json()) as unknown;
		return parseSemanticActions(data);
	}
}

class MockLlmClient implements LlmClient {
	async suggestEdit(input: SuggestEditRequest): Promise<SemanticAction[]> {
		const trimmed = input.items.map((item) => item.text.trim());
		const emptyCount = trimmed.filter((t) => t.length === 0).length;
		const shouldTitle = input.title.trim().length === 0;
		const suggestion: SemanticSuggestion = {};

		if (shouldTitle) {
			suggestion.title = "Shared Checklist";
		}

		if (emptyCount > 0) {
			suggestion.items = input.items
				.filter((item) => item.text.trim().length > 0)
				.map((item) => ({
					id: item.id,
					text: item.text.trim(),
					done: item.done,
					author: item.author,
				}));
		} else if (input.items.length === 0) {
			suggestion.items = [
				{ id: crypto.randomUUID(), text: "First shared task", done: false, author: "AI" },
				{ id: crypto.randomUUID(), text: "Add another item", done: false, author: "AI" },
			];
		}

		return actionsFromLegacySuggestion(suggestion);
	}
}

export function createLlmClient(): LlmClient {
	const endpoint = import.meta.env.VITE_LLM_ENDPOINT?.trim();
	if (endpoint) {
		return new HttpLlmClient(endpoint);
	}
	return new MockLlmClient();
}

export async function applySemanticSuggestion(
	tree: StarterTreeView,
	actions: SemanticAction[],
	options?: { actor?: string }
): Promise<{ auditId?: string }> {
	if (actions.length === 0) {
		return {};
	}
	const result = applySemanticActionsWithAudit(tree, actions, options?.actor);
	return { auditId: result?.auditId };
}
