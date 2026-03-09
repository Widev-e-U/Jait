import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfigPath, getJaitHome, getStatePath } from "./paths.js";
export const ensureJaitHome = async () => {
    await mkdir(getJaitHome(), { recursive: true });
};
export const writeConfig = async (config) => {
    await ensureJaitHome();
    await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
};
export const readConfig = async () => {
    try {
        return JSON.parse(await readFile(getConfigPath(), "utf-8"));
    }
    catch {
        return null;
    }
};
export const writeState = async (state) => {
    await ensureJaitHome();
    await writeFile(getStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
};
export const readState = async () => {
    try {
        return JSON.parse(await readFile(getStatePath(), "utf-8"));
    }
    catch {
        return {};
    }
};
export const resetJaitHome = async () => {
    await rm(getJaitHome(), { recursive: true, force: true });
};
export const resolveDataDir = (configuredPath) => path.isAbsolute(configuredPath) ? configuredPath : path.join(getJaitHome(), configuredPath);
//# sourceMappingURL=storage.js.map