import { isJaitBackend, type JaitBackend } from "./types/thread.js";

export interface JaitBackendInstanceConfig {
  id: string;
  type: JaitBackend;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model?: string;
  numCtx?: number;
}

const JAIT_MODEL_ID_PREFIX = "jait://";

export const JAIT_BACKEND_DEFAULT_URLS: Record<JaitBackend, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434",
  omniroute: "http://localhost:20128/v1",
};

export function parseJaitBackendInstances(raw: string | null | undefined): JaitBackendInstanceConfig[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const instances: JaitBackendInstanceConfig[] = [];
    for (const value of parsed) {
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const type = record.type;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const baseUrl = typeof record.baseUrl === "string"
        ? record.baseUrl.trim().replace(/\/+$/, "")
        : "";
      const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
      const model = typeof record.model === "string" ? record.model.trim() : "";
      const rawNumCtx = typeof record.numCtx === "number" ? record.numCtx : Number(record.numCtx);
      if (!id || !isJaitBackend(type) || !name || !baseUrl || seen.has(id)) continue;
      seen.add(id);
      instances.push({
        id,
        type,
        name,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
        ...(model ? { model } : {}),
        ...(type === "ollama" && Number.isInteger(rawNumCtx) && rawNumCtx >= 2048
          ? { numCtx: rawNumCtx }
          : {}),
      });
    }
    return instances;
  } catch {
    return [];
  }
}

export function serializeJaitBackendInstances(instances: JaitBackendInstanceConfig[]): string {
  return JSON.stringify(instances.map((instance) => ({
    id: instance.id.trim(),
    type: instance.type,
    name: instance.name.trim(),
    baseUrl: instance.baseUrl.trim().replace(/\/+$/, ""),
    ...(instance.apiKey?.trim() ? { apiKey: instance.apiKey.trim() } : {}),
    ...(instance.model?.trim() ? { model: instance.model.trim() } : {}),
    ...(instance.type === "ollama" && instance.numCtx && instance.numCtx >= 2048
      ? { numCtx: instance.numCtx }
      : {}),
  })));
}

export function encodeJaitModelId(
  backend: JaitBackend,
  instanceId: string,
  model: string,
): string {
  return `${JAIT_MODEL_ID_PREFIX}${backend}/${encodeURIComponent(instanceId)}/${encodeURIComponent(model)}`;
}

export function decodeJaitModelId(
  value: string,
): { backend: JaitBackend; instanceId: string; model: string } | null {
  if (!value.startsWith(JAIT_MODEL_ID_PREFIX)) return null;
  const encoded = value.slice(JAIT_MODEL_ID_PREFIX.length);
  const backendSeparator = encoded.indexOf("/");
  if (backendSeparator <= 0) return null;
  const backend = encoded.slice(0, backendSeparator);
  if (!isJaitBackend(backend)) return null;
  const instanceAndModel = encoded.slice(backendSeparator + 1);
  const modelSeparator = instanceAndModel.indexOf("/");
  if (modelSeparator <= 0 || modelSeparator === instanceAndModel.length - 1) return null;
  try {
    const instanceId = decodeURIComponent(instanceAndModel.slice(0, modelSeparator));
    const model = decodeURIComponent(instanceAndModel.slice(modelSeparator + 1));
    return instanceId && model ? { backend, instanceId, model } : null;
  } catch {
    return null;
  }
}
