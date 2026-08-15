/**
 * os-control module — drives the desktop OS inside the Linux-desktop sandbox
 * and the dockur Windows VM (screen capture + input injection).
 */

export * from "./types.js";
export { LinuxDesktopOsControlDriver } from "./linux-desktop-driver.js";
export {
  WindowsOsControlDriver,
  buildWindowsSendKeys,
  escapeSendKeysText,
  extractSshPort,
} from "./windows-driver.js";
export {
  createOsControlResolver,
} from "./resolver.js";
export type {
  OsControlResolver,
  OsSandboxConnection,
  WindowsSshConfig,
} from "./resolver.js";
