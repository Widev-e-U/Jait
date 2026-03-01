import os from "node:os";
import path from "node:path";

export const getJaitHome = (): string => path.join(os.homedir(), ".jait");
export const getConfigPath = (): string => path.join(getJaitHome(), "config.json");
export const getStatePath = (): string => path.join(getJaitHome(), "state.json");
export const getComposePath = (): string => path.join(getJaitHome(), "docker-compose.yml");
