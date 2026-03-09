import os from "node:os";
import path from "node:path";
const resolveHomeDir = () => {
    const home = process.env["JAIT_HOME"] ||
        process.env["HOME"] ||
        process.env["USERPROFILE"] ||
        ((process.env["HOMEDRIVE"] && process.env["HOMEPATH"])
            ? path.join(process.env["HOMEDRIVE"], process.env["HOMEPATH"])
            : "");
    return home || os.homedir();
};
export const getJaitHome = () => path.join(resolveHomeDir(), ".jait");
export const getConfigPath = () => path.join(getJaitHome(), "config.json");
export const getStatePath = () => path.join(getJaitHome(), "state.json");
export const getComposePath = () => path.join(getJaitHome(), "docker-compose.yml");
//# sourceMappingURL=paths.js.map