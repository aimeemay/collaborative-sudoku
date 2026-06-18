import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, randomUUID } from "node:crypto";

function base64url(input: Buffer | string): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function signJwt(payload: Record<string, unknown>, key: string): string {
	const header = { alg: "HS256", typ: "JWT" };
	const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
	const sig = base64url(createHmac("sha256", key).update(data).digest());
	return `${data}.${sig}`;
}

/**
 * Mints an Azure Fluid Relay access token. Satisfies the GET contract of
 * AzureFunctionTokenProvider (tenantId/documentId/userName/userId query params,
 * raw JWT string response). Dormant until AZURE_FLUID_TENANT_KEY is configured.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
	const tenantKey = process.env.AZURE_FLUID_TENANT_KEY;
	if (!tenantKey) {
		res.status(501).send("Azure Fluid Relay not configured (set AZURE_FLUID_TENANT_KEY)");
		return;
	}

	const q = req.query;
	const tenantId = String(q.tenantId ?? process.env.AZURE_FLUID_TENANT_ID ?? "");
	const documentId = typeof q.documentId === "string" ? q.documentId : "";
	const userId = String(q.userId ?? randomUUID());
	const userName = String(q.userName ?? "anonymous");
	const now = Math.round(Date.now() / 1000);

	const claims = {
		documentId,
		scopes: ["doc:read", "doc:write", "summary:write"],
		tenantId,
		user: { id: userId, name: userName },
		iat: now,
		exp: now + 60 * 60,
		ver: "1.0",
		jti: randomUUID(),
	};

	res.setHeader("Content-Type", "text/plain");
	res.status(200).send(signJwt(claims, tenantKey));
}
