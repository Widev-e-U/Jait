export interface JaitConfig {
  llmProvider: "openai" | "ollama";
  gatewayPort: number;
  webPort: number;
  wsPort: number;
  turnEnabled: boolean;
  turnPort: number;
  dataDir: string;
  createdAt: string;
}

export interface JaitState {
  gatewayPid?: number;
  webPid?: number;
  lastStartAt?: string;
}

export interface ServiceHealth {
  name: "gateway" | "web";
  running: boolean;
  pid?: number;
}
