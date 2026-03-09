import { spawn } from "node:child_process";
import { readState, writeState } from "./storage.js";
const isPidRunning = (pid) => {
    if (!pid) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
};
const startDetached = (command, args) => spawn(command, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
});
export const startServices = async (config) => {
    if (config.serviceMode === "docker") {
        throw new Error("Docker mode is not yet supported by start; use generated compose template.");
    }
    const gateway = startDetached("bun", ["run", "--filter", "@jait/gateway", "dev"]);
    gateway.unref();
    const web = startDetached("bun", ["run", "--filter", "@jait/web", "dev"]);
    web.unref();
    const state = {
        gatewayPid: gateway.pid,
        webPid: web.pid,
        lastStartAt: new Date().toISOString(),
    };
    await writeState(state);
    return state;
};
export const stopServices = async () => {
    const state = await readState();
    if (state.gatewayPid && isPidRunning(state.gatewayPid)) {
        process.kill(state.gatewayPid, "SIGTERM");
    }
    if (state.webPid && isPidRunning(state.webPid)) {
        process.kill(state.webPid, "SIGTERM");
    }
    const nextState = {};
    await writeState(nextState);
    return nextState;
};
export const serviceStatus = async () => {
    const state = await readState();
    return [
        {
            name: "gateway",
            running: isPidRunning(state.gatewayPid),
            pid: state.gatewayPid,
        },
        {
            name: "web",
            running: isPidRunning(state.webPid),
            pid: state.webPid,
        },
    ];
};
//# sourceMappingURL=process-manager.js.map