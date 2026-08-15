/**
 * os-control — core types for steering desktop OSes running inside Jait OS
 * sandboxes (Linux XFCE desktop container and dockur Windows VM).
 */

import type { SandboxRunResult } from "../security/sandbox-manager.js";

/** A desktop screenshot captured inside a sandbox OS. */
export interface OsScreenshot {
  /** PNG-encoded image bytes. */
  png: Buffer;
  /** Pixel width of the capture. */
  width: number;
  /** Pixel height of the capture. */
  height: number;
}

export interface OsClickOptions {
  /** Which mouse button to press. Default `left`. */
  button?: "left" | "middle" | "right";
  /** Number of clicks. Default 1. */
  clicks?: number;
}

export interface OsTypeOptions {
  /** Delay between keystrokes in ms (Linux xdotool). Default 12. */
  delayMs?: number;
}

export interface OsKeyOptions {
  /** Hold the combination for this many ms (keydown + keyup). */
  holdMs?: number;
}

export interface OsScrollOptions {
  /** Cursor x position before scrolling. Default: current position. */
  x?: number;
  /** Cursor y position before scrolling. Default: current position. */
  y?: number;
  /** Scroll direction. Default `down`. */
  direction?: "up" | "down" | "left" | "right";
  /** Number of wheel steps (ticks). Default 1. */
  amount?: number;
}

export interface OsExecOptions {
  /** Working directory inside the OS. */
  cwd?: string;
  /** Extra environment variables for the command. */
  env?: Record<string, string>;
  /** Timeout in ms. Default 30_000. */
  timeoutMs?: number;
}

/** Which desktop OS a driver controls. */
export type OsDriverType = "linux-desktop" | "windows";

/**
 * Abstraction over a single sandbox desktop OS. Each concrete implementation
 * translates these high-level operations into the OS's native input/capture
 * tooling (xdotool/import inside the Linux container; PowerShell/user32 over
 * SSH inside the Windows VM).
 */
export interface OsControlDriver {
  /** Which desktop OS this driver controls. */
  readonly osType: OsDriverType;
  /** Capture the full desktop screen as a PNG buffer. */
  screenshot(): Promise<OsScreenshot>;
  /** Move the cursor to (x, y) and click. */
  click(x: number, y: number, opts?: OsClickOptions): Promise<void>;
  /** Move the cursor to (x, y). */
  mouseMove(x: number, y: number): Promise<void>;
  /** Type literal text at the focused control. */
  type(text: string, opts?: OsTypeOptions): Promise<void>;
  /** Send a keyboard shortcut combination (e.g. `ctrl+c`, `super+d`). */
  key(combo: string, opts?: OsKeyOptions): Promise<void>;
  /** Scroll the current viewport. */
  scroll(opts?: OsScrollOptions): Promise<void>;
  /** Run an arbitrary command in the sandbox OS and return its output. */
  exec(command: string, opts?: OsExecOptions): Promise<SandboxRunResult>;
}

/** A driver together with the sandbox it controls. */
export interface OsDriverBinding {
  driver: OsControlDriver;
  containerName: string;
  type: OsDriverType;
}
