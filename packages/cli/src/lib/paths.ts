import os from "node:os";
import path from "node:path";

const resolveHomeDir = (): string => {
  const home =
    process.env["JAIT_HOME"] ||
    process.env["HOME"] ||
    process.env["USERPROFILE"] ||
    ((process.env["HOMEDRIVE"] && process.env["HOMEPATH"])
      ? path.join(process.env["HOMEDRIVE"], process.env["HOMEPATH"])
      : "");

  return home || os.homedir();
};

export const getJaitHome = (): string => path.join(resolveHomeDir(), ".jait");
export const getConfigPath = (): string => path.join(getJaitHome(), "config.json");
export const getStatePath = (): string => path.join(getJaitHome(), "state.json");
