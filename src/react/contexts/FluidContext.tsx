import React, { createContext, useContext } from "react";
import { IFluidContainer } from "fluid-framework";
import { IAzureAudience } from "@fluidframework/azure-client";
import { StarterTreeView } from "../../schema/starterSchema.js";
import { PresenceClients, PresenceUser } from "../../infra/presenceClient.js";
import { LlmClient } from "../../infra/llmClient.js";

export type FluidRuntime = {
	container: IFluidContainer;
	tree: StarterTreeView;
	presence: PresenceClients;
	llm: LlmClient;
	me: PresenceUser;
	audience: IAzureAudience;
};

const FluidContext = createContext<FluidRuntime | null>(null);

export function FluidProvider(props: { value: FluidRuntime; children: React.ReactNode }) {
	const { value, children } = props;
	return <FluidContext.Provider value={value}>{children}</FluidContext.Provider>;
}

export function useFluidRuntime(): FluidRuntime {
	const ctx = useContext(FluidContext);
	if (!ctx) {
		throw new Error("Fluid runtime missing from context");
	}
	return ctx;
}
