import { spawn, type ChildProcess } from "node:child_process";
import type { JaitConfig, JaitState, ServiceHealth } from "../types.js";
import { readState, writeState } from "./storage.js";

const isPidRunning = (pid?: number): boolean => {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const startDetached = (command: string, args: string[]): ChildProcess =>
  spawn(command, args, {
    detached: true,
    stdio: "ignore",
    shell: false,
  });

export const startServices = async (_config: JaitConfig): Promise<JaitState> => {
  const gateway = startDetached("bun", ["run", "--filter", "@jait/gateway", "dev"]);
  gateway.unref();

  const web = startDetached("bun", ["run", "--filter", "@jait/web", "dev"]);
  web.unref();

  const state: JaitState = {
    gatewayPid: gateway.pid,
    webPid: web.pid,
    lastStartAt: new Date().toISOString(),
  };

  await writeState(state);
  return state;
};

export const stopServices = async (): Promise<JaitState> => {
  const state = await readState();
  if (state.gatewayPid && isPidRunning(state.gatewayPid)) {
    process.kill(state.gatewayPid, "SIGTERM");
  }
  if (state.webPid && isPidRunning(state.webPid)) {
    process.kill(state.webPid, "SIGTERM");
  }

  const nextState: JaitState = {};
  await writeState(nextState);
  return nextState;
};

export const serviceStatus = async (): Promise<ServiceHealth[]> => {
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
