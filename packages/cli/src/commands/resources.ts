import { readConfig } from "../lib/storage.js";
import { getJson } from "../lib/http.js";

const getBaseUrl = async (): Promise<string> => {
  const config = await readConfig();
  if (!config) {
    throw new Error("No config found. Run `jait setup` first.");
  }
  return `http://127.0.0.1:${config.gatewayPort}`;
};

export const runSurfacesList = async (): Promise<unknown> => {
  const baseUrl = await getBaseUrl();
  return getJson(`${baseUrl}/surfaces`);
};

export const runDevicesList = async (): Promise<unknown> => {
  return [{ id: "local", kind: "host", trust: "owner" }];
};

export const runCronList = async (): Promise<unknown> => {
  const baseUrl = await getBaseUrl();
  return getJson(`${baseUrl}/jobs`);
};
