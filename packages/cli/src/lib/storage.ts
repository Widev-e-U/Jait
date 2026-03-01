import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfigPath, getJaitHome, getStatePath } from "./paths.js";
import type { JaitConfig, JaitState } from "../types.js";

export const ensureJaitHome = async (): Promise<void> => {
  await mkdir(getJaitHome(), { recursive: true });
};

export const writeConfig = async (config: JaitConfig): Promise<void> => {
  await ensureJaitHome();
  await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
};

export const readConfig = async (): Promise<JaitConfig | null> => {
  try {
    return JSON.parse(await readFile(getConfigPath(), "utf-8")) as JaitConfig;
  } catch {
    return null;
  }
};

export const writeState = async (state: JaitState): Promise<void> => {
  await ensureJaitHome();
  await writeFile(getStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
};

export const readState = async (): Promise<JaitState> => {
  try {
    return JSON.parse(await readFile(getStatePath(), "utf-8")) as JaitState;
  } catch {
    return {};
  }
};

export const resetJaitHome = async (): Promise<void> => {
  await rm(getJaitHome(), { recursive: true, force: true });
};

export const resolveDataDir = (configuredPath: string): string =>
  path.isAbsolute(configuredPath) ? configuredPath : path.join(getJaitHome(), configuredPath);
