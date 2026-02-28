export type {
  Surface,
  SurfaceFactory,
  SurfaceSnapshot,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceState,
} from "./contracts.js";
export { SurfaceRegistry } from "./registry.js";
export { TerminalSurface, TerminalSurfaceFactory } from "./terminal.js";
export { FileSystemSurface, FileSystemSurfaceFactory } from "./filesystem.js";
export {
  BrowserSurface,
  BrowserSurfaceFactory,
  type BrowserDriver,
  type BrowserPageSnapshot,
  type BrowserInteractiveElement,
} from "./browser.js";
