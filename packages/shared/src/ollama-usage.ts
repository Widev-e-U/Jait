/** Host diagnostics for the Ollama usage setup UI. Never includes key material. */
export interface OllamaUsageSetup {
  host: string;
  platform: string;
  gatewayUser: string;
  local: boolean;
  keyStatus: "remote" | "missing" | "unreadable" | "readable";
  keyPath: string | null;
  permissionCommand: string | null;
}
