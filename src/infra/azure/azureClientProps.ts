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
if (local) {
	console.warn(`Configured to use local tinylicious.`);
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
		endpoint: "http://localhost:7070",
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
