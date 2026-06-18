/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	AzureRemoteConnectionConfig,
	AzureClientProps,
	AzureLocalConnectionConfig,
	ITelemetryBaseLogger,
} from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "./azureTokenProvider.js";
import { AzureFunctionTokenProvider, azureUser } from "./azureTokenProvider.js";

const client = import.meta.env.VITE_FLUID_CLIENT;
const local = client === undefined || client === "local";
// Tinylicious endpoint: defaults to the local dev relay, but can be pointed at a
// hosted tinylicious (e.g. on Fly.io) via VITE_TINYLICIOUS_ENDPOINT for online play.
const tinyliciousEndpoint =
	import.meta.env.VITE_TINYLICIOUS_ENDPOINT ?? "http://localhost:7070";
if (local) {
	console.warn(`Configured to use tinylicious at ${tinyliciousEndpoint}.`);
}

export function getClientProps(
	user?: typeof azureUser,
	logger?: ITelemetryBaseLogger
): AzureClientProps {
	// Use the caller-supplied identity for the connection token so the Fluid
	// audience keys members by the same id the app uses for players. Fall back to
	// the module-level random user only when no identity is provided.
	const localConnectionConfig: AzureLocalConnectionConfig = {
		type: "local",
		tokenProvider: new InsecureTokenProvider("VALUE_NOT_USED", user ?? azureUser),
		endpoint: tinyliciousEndpoint,
	};

	const remoteConnectionConfig: AzureRemoteConnectionConfig = {
		type: "remote",
		tenantId: import.meta.env.VITE_AZURE_TENANT_ID!,
		tokenProvider: new AzureFunctionTokenProvider(
			import.meta.env.VITE_AZURE_FUNCTION_TOKEN_PROVIDER_URL!,
			user ?? azureUser
		),
		endpoint: import.meta.env.VITE_AZURE_ORDERER!,
	};

	const connectionConfig: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = !local
		? remoteConnectionConfig
		: localConnectionConfig;

	return {
		connection: connectionConfig,
		logger,
	};
}
