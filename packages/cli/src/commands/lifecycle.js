import { startServices, stopServices, serviceStatus } from "../lib/process-manager.js";
import { readConfig } from "../lib/storage.js";
export const runStart = async () => {
    const config = await readConfig();
    if (!config) {
        throw new Error("No config found. Run `jait setup` first.");
    }
    await startServices(config);
};
export const runStop = async () => {
    await stopServices();
};
export const runStatus = async () => {
    const status = await serviceStatus();
    return status.map((service) => `${service.name}: ${service.running ? "running" : "stopped"}${service.pid ? ` (pid=${service.pid})` : ""}`);
};
//# sourceMappingURL=lifecycle.js.map