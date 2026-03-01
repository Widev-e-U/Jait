import { access } from "node:fs/promises";
import type { JaitConfig } from "../types.js";

export interface DoctorCheck {
  name: string;
  healthy: boolean;
  message: string;
}

const checkPort = async (port: number): Promise<boolean> => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

export const runDoctor = async (config: JaitConfig): Promise<DoctorCheck[]> => {
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "bun-installed",
    healthy: typeof Bun !== "undefined",
    message: typeof Bun !== "undefined" ? "Bun runtime detected" : "Bun runtime is missing",
  });

  try {
    await access(config.dataDir);
    checks.push({ name: "data-dir", healthy: true, message: `Data directory exists at ${config.dataDir}` });
  } catch {
    checks.push({ name: "data-dir", healthy: false, message: `Data directory missing at ${config.dataDir}` });
  }

  const gatewayHealthy = await checkPort(config.gatewayPort);
  checks.push({
    name: "gateway-port",
    healthy: gatewayHealthy,
    message: gatewayHealthy ? `Gateway responded on :${config.gatewayPort}` : `Gateway did not respond on :${config.gatewayPort}`,
  });

  return checks;
};
