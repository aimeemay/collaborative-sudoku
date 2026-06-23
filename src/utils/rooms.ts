// 4-digit room codes ↔ Fluid container IDs.
//
// The Fluid relay assigns opaque GUID container IDs. To let people join with a
// short, friendly code, we keep a tiny lookup table in Supabase. We talk to it
// directly from the browser with the *public* anon key (RLS only permits select
// and 4-digit insert), so codes resolve across tabs and devices in both local dev
// (plain `vite serve`, no serverless functions) and production. localStorage is
// kept purely as an offline-resilience cache/fallback.

const CODE_RE = /^\d{4}$/;
const LS_KEY = "sudoku_room_codes_v1";

// Public, RLS-protected Supabase endpoint. Safe to ship in the client bundle and
// overridable via env, mirroring how VITE_TINYLICIOUS_ENDPOINT is handled.
const SUPABASE_URL =
	(import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
	"https://xvwpyfeyjygkreqoqxjl.supabase.co";
const SUPABASE_ANON_KEY =
	(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2d3B5ZmV5anlna3JlcW9xeGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTY4MzYsImV4cCI6MjA5NzM3MjgzNn0.xkMrWGY3BBNhkNiCA0PeuhJhh5xnUrW6Z0eWj_m1MH8";

const REST_URL = `${SUPABASE_URL}/rest/v1/room_codes`;
const supaHeaders = (): Record<string, string> => ({
	apikey: SUPABASE_ANON_KEY,
	Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
	"Content-Type": "application/json",
});

const supaConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export function isRoomCode(value: string): boolean {
	return CODE_RE.test(value.trim());
}

function randomCode(): string {
	return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// ── localStorage cache / offline fallback ─────────────────────────────────────

function readLocalMap(): Record<string, string> {
	try {
		const raw = localStorage.getItem(LS_KEY);
		return raw ? (JSON.parse(raw) as Record<string, string>) : {};
	} catch {
		return {};
	}
}

function writeLocalMap(map: Record<string, string>): void {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify(map));
	} catch {
		// storage unavailable — ignore
	}
}

function cacheLocal(code: string, containerId: string): void {
	const map = readLocalMap();
	map[code] = containerId;
	writeLocalMap(map);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Registers a fresh, unused 4-digit code for the given container and returns it.
 * Retries on collisions. Uses Supabase when reachable, otherwise localStorage.
 */
export async function generateRoomCode(containerId: string): Promise<string> {
	for (let attempt = 0; attempt < 12; attempt++) {
		const code = randomCode();
		if (!supaConfigured) {
			// No backend — local-only mapping (same-context joins only).
			const map = readLocalMap();
			if (map[code]) continue;
			map[code] = containerId;
			writeLocalMap(map);
			return code;
		}
		try {
			const res = await fetch(REST_URL, {
				method: "POST",
				headers: { ...supaHeaders(), Prefer: "return=representation" },
				body: JSON.stringify({ code, container_id: containerId }),
			});
			// 409 => primary-key conflict: code already taken, try another.
			if (res.status === 409) continue;
			if (!res.ok) throw new Error(`room code save failed: ${res.status}`);
			cacheLocal(code, containerId);
			return code;
		} catch {
			// Network/Supabase unavailable — degrade to a local-only mapping so the
			// create flow still completes (resolvable within this context only).
			const map = readLocalMap();
			if (map[code]) continue;
			map[code] = containerId;
			writeLocalMap(map);
			return code;
		}
	}
	// Extremely unlikely with a near-empty table; degrade by mapping locally.
	const code = randomCode();
	cacheLocal(code, containerId);
	return code;
}

/** Resolves a 4-digit code to a container ID, or null if unknown. */
export async function resolveRoomCode(code: string): Promise<string | null> {
	const trimmed = code.trim();
	if (!CODE_RE.test(trimmed)) return null;
	if (supaConfigured) {
		try {
			const params = new URLSearchParams({
				select: "container_id",
				code: `eq.${trimmed}`,
				limit: "1",
			});
			const res = await fetch(`${REST_URL}?${params.toString()}`, {
				headers: supaHeaders(),
			});
			if (res.ok) {
				const rows = (await res.json()) as { container_id?: string }[];
				const containerId = rows[0]?.container_id ?? null;
				if (containerId) {
					cacheLocal(trimmed, containerId);
					return containerId;
				}
				// Not in Supabase — fall through to any local-only mapping.
			}
		} catch {
			// fall through to localStorage
		}
	}
	return readLocalMap()[trimmed] ?? null;
}

export type JoinTarget =
	| { kind: "none" }
	| { kind: "code"; code: string }
	| { kind: "id"; containerId: string; code?: string };

/**
 * Interprets whatever the user typed/pasted into the join field: a bare 4-digit
 * code, a full URL (?room=CODE or legacy ?id=GUID), or a bare container GUID.
 */
export function parseJoinInput(input: string): JoinTarget {
	const trimmed = input.trim();
	if (!trimmed) return { kind: "none" };

	try {
		const url = new URL(trimmed);
		const room = url.searchParams.get("room");
		const code = room && CODE_RE.test(room) ? room : undefined;
		const id = url.searchParams.get("id");
		// A self-contained link carries the container id — prefer it (no lookup
		// needed) and keep the code for display.
		if (id) return { kind: "id", containerId: id, code };
		if (code) return { kind: "code", code };
		return { kind: "none" };
	} catch {
		// not a URL
	}

	if (CODE_RE.test(trimmed)) return { kind: "code", code: trimmed };
	// Looks like a bare container id (legacy share). Treat anything non-trivial
	// that isn't a partial code as an id.
	if (/^\d{1,3}$/.test(trimmed)) return { kind: "none" }; // partial code — wait for more
	return { kind: "id", containerId: trimmed };
}

/** Resolves a parsed join target to a concrete container id (+ code if known). */
export async function resolveJoinTarget(
	target: JoinTarget
): Promise<{ containerId: string; code?: string } | null> {
	if (target.kind === "none") return null;
	if (target.kind === "id") return { containerId: target.containerId, code: target.code };
	const containerId = await resolveRoomCode(target.code);
	return containerId ? { containerId, code: target.code } : null;
}
