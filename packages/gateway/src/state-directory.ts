import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** Gateway-owned state, independent of the user's home and provider CLI profiles. */
export function getStateDirectory(): string {
  const configured = process.env["JAIT_STATE_DIR"]?.trim();
  if (!configured) return join(homedir(), ".jait");
  if (!isAbsolute(configured)) throw new Error("JAIT_STATE_DIR must be an absolute path");
  return configured;
}
