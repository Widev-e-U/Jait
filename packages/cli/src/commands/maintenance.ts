import { readFile } from "node:fs/promises";
import { runDoctor } from "../lib/doctor.js";
import { getComposePath } from "../lib/paths.js";
import { readConfig, resetJaitHome } from "../lib/storage.js";

export const runLogs = async (): Promise<string> => {
  try {
    return await readFile(getComposePath(), "utf-8");
  } catch {
    return "No compose template found yet. Run `jait setup`.";
  }
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
  return "Update plan: pull latest docker images and run migration hooks (stubbed for Sprint 8).";
};
