import type { VercelRequest, VercelResponse } from "@vercel/node";

// Maps short, shareable 4-digit room codes to Fluid container IDs. The Fluid
// relay assigns opaque GUID container IDs, so we keep a small lookup table to
// let players join with a friendly code instead. Server-only (service role key).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CODE_RE = /^\d{4}$/;

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
	const base = `${SUPABASE_URL}/rest/v1/room_codes`;

	try {
		if (req.method === "GET") {
			const code = typeof req.query.code === "string" ? req.query.code : "";
			if (!CODE_RE.test(code)) {
				res.status(400).json({ error: "invalid code" });
				return;
			}
			const params = new URLSearchParams();
			params.set("select", "code,container_id");
			params.set("code", `eq.${code}`);
			params.set("limit", "1");

			const r = await fetch(`${base}?${params.toString()}`, { headers });
			if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
			const rows = (await r.json()) as { code: string; container_id: string }[];
			if (rows.length === 0) {
				res.status(404).json({ error: "not found" });
				return;
			}
			res.status(200).json({ code: rows[0].code, containerId: rows[0].container_id });
			return;
		}

		if (req.method === "POST") {
			const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
			const code = String(body?.code ?? "");
			const containerId = String(body?.containerId ?? "");
			if (!CODE_RE.test(code) || containerId.length === 0) {
				res.status(400).json({ error: "invalid body" });
				return;
			}

			const r = await fetch(base, {
				method: "POST",
				headers: { ...headers, Prefer: "return=representation" },
				body: JSON.stringify({ code, container_id: containerId }),
			});
			// 409 => code already taken; surface so the client can retry a new code.
			if (r.status === 409) {
				res.status(409).json({ error: "code taken" });
				return;
			}
			if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
			const rows = (await r.json()) as { code: string; container_id: string }[];
			res.status(201).json(rows[0] ? { code: rows[0].code, containerId: rows[0].container_id } : null);
			return;
		}

		res.setHeader("Allow", "GET, POST");
		res.status(405).json({ error: "method not allowed" });
	} catch (err) {
		res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
	}
}
