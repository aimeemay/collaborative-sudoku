import React from "react";
import { useFluidRuntime } from "./react/contexts/FluidContext.js";
import { useSharedTreeState } from "./react/hooks/useSharedTreeState.js";
import {
	addItem,
	getSemanticAuditEntries,
	rollbackSemanticEdit,
	toggleItem,
	updateTitle,
} from "./infra/sharedTreeClient.js";
import { applySemanticSuggestion } from "./infra/llmClient.js";
import { usePresenceUsers } from "./infra/presenceClient.js";
import type { AppModel, Item } from "./schema/starterSchema.js";
import {
	createSemanticPreviewDiff,
	SemanticAction,
	SemanticSnapshot,
} from "./infra/semanticActions.js";

export function StarterApp() {
	const { tree, llm, presence, me } = useFluidRuntime();
	const root = tree.root as AppModel;
	const snapshot = useSharedTreeState(
		root,
		React.useCallback(
			(target: AppModel) => ({
				title: target.title,
				items: [...target.items],
			}),
			[]
		),
		"treeChanged"
	);

	const [newItem, setNewItem] = React.useState("");
	const [busy, setBusy] = React.useState(false);
	const [pendingActions, setPendingActions] = React.useState<SemanticAction[] | null>(null);
	const [aiMessage, setAiMessage] = React.useState<string | null>(null);

	const users = usePresenceUsers(presence.users);
	const semanticAuditEntries = React.useMemo(() => getSemanticAuditEntries(tree).slice(0, 5), [snapshot, tree]);
	const completed = snapshot.items.filter((i: Item) => i.done).length;
	const total = snapshot.items.length;
	const remaining = total - completed;

	const semanticBaseSnapshot: SemanticSnapshot = React.useMemo(
		() => ({
			title: snapshot.title,
			items: snapshot.items.map((item) => ({
				id: item.id,
				text: item.text,
				done: item.done,
				author: item.author,
			})),
		}),
		[snapshot]
	);

	const semanticPreviewDiff = React.useMemo(() => {
		if (!pendingActions || pendingActions.length === 0) {
			return null;
		}
		return createSemanticPreviewDiff(semanticBaseSnapshot, pendingActions);
	}, [semanticBaseSnapshot, pendingActions]);

	const handleAdd = (e: React.FormEvent) => {
		e.preventDefault();
		const text = newItem.trim();
		if (!text) return;
		addItem(tree, text, me.name);
		setNewItem("");
	};

	const handleAI = async () => {
		setBusy(true);
		setAiMessage(null);
		try {
			const actions = await llm.suggestEdit({
				title: snapshot.title,
				items: snapshot.items,
			});
			if (actions.length === 0) {
				setPendingActions(null);
				setAiMessage("No changes suggested.");
				return;
			}
			setPendingActions(actions);
			setAiMessage(`Drafted ${actions.length} proposed change${actions.length === 1 ? "" : "s"}.`);
		} catch (error) {
			console.error("LLM suggestion failed", error);
			setAiMessage("Could not generate AI changes.");
		} finally {
			setBusy(false);
		}
	};

	const handleApplySuggestion = async () => {
		if (!pendingActions || pendingActions.length === 0) {
			return;
		}
		await applySemanticSuggestion(tree, pendingActions, { actor: me.name });
		setPendingActions(null);
		setAiMessage("Applied AI changes.");
	};

	const handleDiscardSuggestion = () => {
		setPendingActions(null);
		setAiMessage("Discarded AI changes.");
	};

	const handleRollback = (auditId: string) => {
		const rolledBack = rollbackSemanticEdit(tree, auditId);
		setAiMessage(rolledBack ? "Rolled back AI change." : "Could not roll back selected change.");
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-slate-50">
			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
				<header className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
					<div className="flex flex-wrap items-center gap-3">
						<div className="flex-1 min-w-[220px]">
							<input
								className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg font-semibold text-slate-50 shadow-inner shadow-black/10 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-500/40"
								value={snapshot.title}
								onChange={(e) => updateTitle(tree, e.target.value)}
								placeholder="Shared list title"
							/>
						</div>
						<button
							onClick={handleAI}
							disabled={busy}
							className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-700 disabled:text-slate-200"
						>
							{busy ? "Drafting..." : "Smart fill"}
						</button>
						<div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-200">
							<span className="h-2 w-2 rounded-full bg-emerald-400" />
							{users.length} online
						</div>
					</div>
					<div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
						<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
							<p className="text-xs uppercase tracking-wide text-slate-300">Owner</p>
							<p className="text-sm font-semibold text-white">{me.name}</p>
						</div>
						<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
							<p className="text-xs uppercase tracking-wide text-slate-300">
								Progress
							</p>
							<p className="text-sm font-semibold text-white">
								{completed}/{total} done · {remaining} left
							</p>
						</div>
						<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
							<p className="text-xs uppercase tracking-wide text-slate-300">
								Presence
							</p>
							<div className="flex flex-wrap items-center gap-2">
								{users.map((user) => (
									<span
										key={user.value.id}
										className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white shadow-sm shadow-black/20"
									>
										<span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/90 text-[10px] font-semibold text-slate-900">
											{(user.value.name ?? "?").slice(0, 2).toUpperCase()}
										</span>
										{user.value.name}
									</span>
								))}
								{users.length === 0 && (
									<span className="text-slate-300">No one online yet</span>
								)}
							</div>
						</div>
					</div>
				</header>

				<section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur">
					<div className="mb-5 space-y-3">
						{aiMessage && (
							<div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
								{aiMessage}
							</div>
						)}
						{pendingActions && pendingActions.length > 0 && (
							<div className="rounded-xl border border-white/10 bg-white/5 p-4">
								<p className="text-sm font-semibold text-white">Pending AI proposal</p>
								{semanticPreviewDiff && (
									<div className="mt-2 space-y-2 text-sm text-slate-200">
										{semanticPreviewDiff.titleChanged && (
											<div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
												<p className="text-xs uppercase tracking-wide text-slate-300">Title</p>
												<p className="text-slate-300 line-through">{semanticPreviewDiff.before.title}</p>
												<p className="text-emerald-300">{semanticPreviewDiff.after.title}</p>
											</div>
										)}

										{semanticPreviewDiff.addedItems.length > 0 && (
											<div>
												<p className="text-xs uppercase tracking-wide text-slate-300">Added items</p>
												<ul className="mt-1 list-disc space-y-1 pl-5">
													{semanticPreviewDiff.addedItems.map((item) => (
														<li key={item.id} className="text-emerald-300">{item.text}</li>
													))}
												</ul>
											</div>
										)}

										{semanticPreviewDiff.changedItems.length > 0 && (
											<div>
												<p className="text-xs uppercase tracking-wide text-slate-300">Changed items</p>
												<ul className="mt-1 list-disc space-y-1 pl-5">
													{semanticPreviewDiff.changedItems.map((change) => (
														<li key={change.id}>
															<span className="text-slate-300 line-through">{change.before.text}</span>
															<span className="mx-2 text-slate-400">→</span>
															<span className="text-amber-300">{change.after.text}</span>
															{change.before.done !== change.after.done && (
																<span className="ml-2 text-xs text-cyan-300">
																	({change.after.done ? "marked done" : "marked active"})
																</span>
															)}
														</li>
													))}
												</ul>
											</div>
										)}

										{semanticPreviewDiff.removedItems.length > 0 && (
											<div>
												<p className="text-xs uppercase tracking-wide text-slate-300">Removed items</p>
												<ul className="mt-1 list-disc space-y-1 pl-5">
													{semanticPreviewDiff.removedItems.map((item) => (
														<li key={item.id} className="text-rose-300 line-through">{item.text}</li>
													))}
												</ul>
											</div>
										)}
									</div>
								)}
								<div className="mt-3 flex flex-wrap gap-2">
									<button
										onClick={handleApplySuggestion}
										className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
									>
										Apply suggestion
									</button>
									<button
										onClick={handleDiscardSuggestion}
										className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
									>
										Discard
									</button>
								</div>
							</div>
						)}

						{semanticAuditEntries.length > 0 && (
							<div className="rounded-xl border border-white/10 bg-white/5 p-4">
								<p className="text-sm font-semibold text-white">Recent AI changes</p>
								<ul className="mt-2 space-y-2 text-sm text-slate-200">
									{semanticAuditEntries.map((entry) => (
										<li
											key={entry.id}
											className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
										>
											<div>
												<p className="text-white">
													{new Date(entry.createdAt).toLocaleTimeString()} • {entry.actor ?? "Unknown"}
												</p>
												<p className="text-xs text-slate-300">
													{entry.actions.length} action{entry.actions.length === 1 ? "" : "s"}
												</p>
											</div>
											<button
												onClick={() => handleRollback(entry.id)}
												className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
											>
												Rollback
											</button>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>

					<form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row">
						<input
							className="flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white shadow-inner shadow-black/10 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-400/40"
							value={newItem}
							onChange={(e) => setNewItem(e.target.value)}
							placeholder="Add a shared item"
						/>
						<button
							type="submit"
							className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
						>
							Add
						</button>
					</form>

					<div className="mt-5 space-y-2">
						{snapshot.items.map((item: Item) => (
							<div
								key={item.id}
								className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-sm shadow-black/10"
							>
								<div className="flex items-center gap-3">
									<input
										type="checkbox"
										checked={item.done}
										onChange={() => toggleItem(tree, item.id)}
										className="h-4 w-4 rounded border-white/40 bg-transparent text-emerald-400 focus:ring-emerald-300"
									/>
									<div className="flex flex-col">
										<span
											className={
												item.done
													? "text-slate-400 line-through"
													: "text-white"
											}
										>
											{item.text}
										</span>
										{item.author && (
											<span className="text-xs text-slate-400">
												by {item.author}
											</span>
										)}
									</div>
								</div>
							</div>
						))}
						{snapshot.items.length === 0 && (
							<div className="rounded-xl border border-dashed border-white/20 px-4 py-6 text-center text-slate-300">
								No shared items yet. Add one above or ask AI to draft a list.
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
