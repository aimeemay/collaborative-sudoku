import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DbRow = {
	id: string;
	completed_at: string;
	elapsed_ms: number;
	difficulty: string;
	game_mode: string;
	players: string[] | null;
};

function toEntry(r: DbRow) {
	return {
		id: r.id,
		completedAt: new Date(r.completed_at).getTime(),
		elapsedMs: r.elapsed_ms,
		difficulty: r.difficulty,
		gameMode: r.game_mode,
		players: r.players ?? [],
	};
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
	if (!SUPABASE_URL || !SERVICE_KEY) {
		res.status(500).json({ error: "Supabase env not configured" });
		return;
	}

	const headers: Record<string, string> = {
		apikey: SERVICE_KEY,
		Authorization: `Bearer ${SERVICE_KEY}`,
		"Content-Type": "application/json",
	};
	const base = `${SUPABASE_URL}/rest/v1/leaderboard`;

	try {
		if (req.method === "GET") {
			const difficulty =
				typeof req.query.difficulty === "string" ? req.query.difficulty : undefined;
			const limit = Math.min(
				Math.max(parseInt(String(req.query.limit ?? "10"), 10) || 10, 1),
				100
			);
			const params = new URLSearchParams();
			params.set("select", "*");
			params.set("order", "elapsed_ms.asc");
			params.set("limit", String(limit));
			if (difficulty) params.set("difficulty", `eq.${difficulty}`);

			const r = await fetch(`${base}?${params.toString()}`, { headers });
			if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
			const rows = (await r.json()) as DbRow[];
			res.status(200).json(rows.map(toEntry));
			return;
		}

		if (req.method === "POST") {
			const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
			const elapsedMs = Number(body?.elapsedMs);
			const difficulty = String(body?.difficulty ?? "");
			const gameMode = String(body?.gameMode ?? "");
			const players = Array.isArray(body?.players) ? body.players.map(String) : [];

			if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !difficulty || !gameMode) {
				res.status(400).json({ error: "invalid entry" });
				return;
			}

			const r = await fetch(base, {
				method: "POST",
				headers: { ...headers, Prefer: "return=representation" },
				body: JSON.stringify({
					elapsed_ms: Math.round(elapsedMs),
					difficulty,
					game_mode: gameMode,
					players,
				}),
			});
			if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
			const rows = (await r.json()) as DbRow[];
			res.status(201).json(rows[0] ? toEntry(rows[0]) : null);
			return;
		}

		res.setHeader("Allow", "GET, POST");
		res.status(405).json({ error: "method not allowed" });
	} catch (err) {
		res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
	}
}
