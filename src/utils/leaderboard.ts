export type LeaderboardEntry = {
	id: string;
	completedAt: number; // unix ms
	elapsedMs: number;
	difficulty: string;
	gameMode: string;
	players: string[]; // names, all equally credited
};

export type NewLeaderboardEntry = Omit<LeaderboardEntry, "id" | "completedAt">;

const KEY = "sudoku_leaderboard_v1";
const MAX = 100; // keep up to 100 locally, display top 10

// ── Remote API (Supabase-backed via /api/leaderboard) ─────────────────────────
// Falls back to localStorage when the serverless functions aren't available
// (e.g. plain `vite serve` local dev without Vercel functions).

export async function fetchLeaderboard(
	difficulty?: string,
	limit = 10
): Promise<LeaderboardEntry[]> {
	try {
		const params = new URLSearchParams();
		if (difficulty) params.set("difficulty", difficulty);
		params.set("limit", String(limit));
		const res = await fetch(`/api/leaderboard?${params.toString()}`);
		if (!res.ok) throw new Error(`leaderboard fetch failed: ${res.status}`);
		return (await res.json()) as LeaderboardEntry[];
	} catch {
		return getLocalLeaderboard(difficulty, limit);
	}
}

export async function saveLeaderboardEntry(entry: NewLeaderboardEntry): Promise<void> {
	try {
		const res = await fetch("/api/leaderboard", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(entry),
		});
		if (!res.ok) throw new Error(`leaderboard save failed: ${res.status}`);
	} catch {
		saveLocalLeaderboardEntry(entry);
	}
}

// ── Local fallback (localStorage) ─────────────────────────────────────────────

function getAllLocal(): LeaderboardEntry[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		return JSON.parse(raw) as LeaderboardEntry[];
	} catch {
		return [];
	}
}

function getLocalLeaderboard(difficulty?: string, limit = 10): LeaderboardEntry[] {
	let all = getAllLocal();
	if (difficulty) all = all.filter((e) => e.difficulty === difficulty);
	return all.sort((a, b) => a.elapsedMs - b.elapsedMs).slice(0, limit);
}

function saveLocalLeaderboardEntry(entry: NewLeaderboardEntry): void {
	const all = getAllLocal();
	all.push({ ...entry, id: crypto.randomUUID(), completedAt: Date.now() });
	all.sort((a, b) => a.elapsedMs - b.elapsedMs);
	try {
		localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)));
	} catch {
		// storage full — ignore
	}
}

export function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}
