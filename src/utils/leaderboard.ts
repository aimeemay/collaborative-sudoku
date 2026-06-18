export type LeaderboardEntry = {
	id: string;
	completedAt: number; // unix ms
	elapsedMs: number;
	difficulty: string;
	gameMode: string;
	players: string[]; // names, all equally credited
};

const KEY = "sudoku_leaderboard_v1";
const MAX = 100; // keep up to 100, display top 10

export function saveLeaderboardEntry(entry: LeaderboardEntry): void {
	const all = getLeaderboard();
	all.push(entry);
	all.sort((a, b) => a.elapsedMs - b.elapsedMs);
	try {
		localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)));
	} catch {
		// storage full — ignore
	}
}

export function getLeaderboard(): LeaderboardEntry[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		return JSON.parse(raw) as LeaderboardEntry[];
	} catch {
		return [];
	}
}

export function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}
