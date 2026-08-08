import type { FsNode } from "@jait/shared/types";
import type { CliProviderAdapter, ProviderId } from "../providers/contracts.js";

type ProviderLocation = Pick<CliProviderAdapter, "executionNodeId" | "providerType"> & {
  info: { available: boolean };
};

type ProviderLookup = {
  getForUser(providerId: ProviderId, userId: string): ProviderLocation | undefined;
};

type NodeLookup = {
  getFsNodes(): Array<Pick<FsNode, "id" | "providers">>;
};

export interface ProjectProviderAvailabilityOptions {
  providerId: string;
  projectNodeId: string | null | undefined;
  userId: string;
  providerRegistry?: ProviderLookup;
  ws?: NodeLookup;
}

export function projectSupportsProvider({
  providerId,
  projectNodeId,
  userId,
  providerRegistry,
  ws,
}: ProjectProviderAvailabilityOptions): boolean {
  if (providerId === "jait") return true;

  const registeredProvider = providerRegistry?.getForUser(providerId as ProviderId, userId);
  if (!projectNodeId || projectNodeId === "gateway") {
    return registeredProvider?.info.available === true
      && (!registeredProvider.executionNodeId || registeredProvider.executionNodeId === "gateway");
  }

  if (registeredProvider?.info.available === false) return false;
  if (registeredProvider?.executionNodeId && registeredProvider.executionNodeId !== projectNodeId) {
    return false;
  }

  const providerType = registeredProvider?.providerType ?? providerId;
  const projectNode = ws?.getFsNodes().find((node) => node.id === projectNodeId);
  return projectNode?.providers?.includes(providerType) === true;
}
