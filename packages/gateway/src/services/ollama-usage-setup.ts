import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { hostname, userInfo } from "node:os";
import type { OllamaUsageSetup } from "@jait/shared";
import { isLocalOllamaUrl, ollamaDeviceKeyPaths } from "./ollama-device-auth.js";

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** Read metadata only. Commands are guidance, never executed by a usage request. */
export async function getOllamaUsageSetup(baseUrl: string): Promise<OllamaUsageSetup> {
  const user = userInfo();
  const local = isLocalOllamaUrl(baseUrl);
  const result: OllamaUsageSetup = {
    host: hostname(), platform: process.platform, gatewayUser: user.username,
    local, keyStatus: local ? "missing" : "remote", keyPath: null, permissionCommand: null,
  };
  if (!local) return result;
  for (const path of ollamaDeviceKeyPaths()) {
    try {
      if (!(await stat(path)).isFile()) continue;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!result.keyPath && (code === "EACCES" || code === "EPERM")) {
        // A blocked parent prevents confirming the file exists. Report access
        // failure, but only generate file ACL commands for confirmed files.
        result.keyStatus = "unreadable";
        result.keyPath = path;
      }
      continue;
    }
    try {
      await access(path, constants.R_OK);
      return { ...result, keyStatus: "readable", keyPath: path, permissionCommand: null };
    } catch {
      // Keep looking: the reader also falls back to other standard locations.
      if (!result.keyPath) {
        result.keyStatus = "unreadable";
        result.keyPath = path;
        result.permissionCommand = process.platform === "linux" && user.uid >= 0
          ? `sudo setfacl -m u:${user.uid}:r -- ${shellQuote(path)}`
          : null;
      }
    }
  }
  return result;
}
