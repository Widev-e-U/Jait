import { runDoctor } from "../lib/doctor.js";
import { readConfig, resetJaitHome } from "../lib/storage.js";

export const runLogs = async (): Promise<string> => {
  return "Logs: use `journalctl` or check the gateway output directly.";
};

export const runDoctorCommand = async (): Promise<string[]> => {
  const config = await readConfig();
  if (!config) {
    throw new Error("No config found. Run `jait setup` first.");
  }

  const checks = await runDoctor(config);
  return checks.map((check) => `${check.healthy ? "✅" : "❌"} ${check.name} — ${check.message}`);
};

export const runReset = async (): Promise<void> => {
  await resetJaitHome();
};

export const runUpdate = async (): Promise<string> => {
  return "Update plan: pull latest npm packages and run migration hooks (stubbed for Sprint 8).";
};
