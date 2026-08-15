/**
 * os.* — operating-system control tools.
 *
 * These tools steer the desktop OS running inside OS sandboxes (the Linux
 * XFCE desktop container and the dockur Windows VM): capture the desktop,
 * move/click the mouse, type text, send keyboard shortcuts, scroll, and run
 * commands inside the sandbox OS.
 *
 * They are additive and intentionally separate from the host `os.query` /
 * `os.install` tools (os-tools.ts). Names here use the `os.` prefix but the
 * host OS tools do not collide (os.query/os.install vs os.screenshot/os.click/
 * os.mouse/os.type/os.keyboard/os.scroll/os.exec/os.sandbox list).
 */

import { SandboxManager } from "../security/sandbox-manager.js";
import { createOsControlResolver, type OsControlResolver } from "../os-control/resolver.js";
import type { OsControlDriver, OsScreenshot } from "../os-control/types.js";
import type { ToolDefinition, ToolResult } from "./contracts.js";

/** Parameters common to tools that need a sandbox resolved. */
interface OsSandboxTargetInput {
  /** Optional container name of the OS sandbox. Defaults to the most recent running one. */
  containerName?: string;
}

interface ClickInput extends OsSandboxTargetInput {
  x: number;
  y: number;
  button?: "left" | "middle" | "right";
  clicks?: number;
}
interface MouseInput extends OsSandboxTargetInput {
  x: number;
  y: number;
}
interface TypeInput extends OsSandboxTargetInput {
  text: string;
  delayMs?: number;
}
interface KeyboardInput extends OsSandboxTargetInput {
  combo: string;
  holdMs?: number;
}
interface ScrollInput extends OsSandboxTargetInput {
  x?: number;
  y?: number;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
}
interface ExecInput extends OsSandboxTargetInput {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

const ok = (message: string, data?: Record<string, unknown>): ToolResult => ({
  ok: true,
  message,
  data,
});

/** Shared "act then screenshot" UX — mirror browser action tools. */
function makeActionTool(
  resolver: OsControlResolver,
  verb: string,
  action: (
    driver: OsControlDriver,
    containerName: string,
    input: Record<string, unknown>,
  ) => Promise<void>,
): ToolDefinition["execute"] {
  return async (input) => {
    let binding;
    try {
      binding = await resolver.resolve((input as OsSandboxTargetInput).containerName);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }

    try {
      await action(binding.driver, binding.containerName, input as Record<string, unknown>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `${verb} failed on sandbox "${binding.containerName}": ${msg}`,
      };
    }

    // Auto-capture a screenshot so the caller sees the result of the action.
    try {
      const shot = await binding.driver.screenshot();
      return {
        ok: true,
        message: `${verb} applied on sandbox "${binding.containerName}".`,
        data: { screenshot: { pngBase64: shot.png.toString("base64"), width: shot.width, height: shot.height } },
      };
    } catch {
      return {
        ok: true,
        message: `${verb} applied on sandbox "${binding.containerName}" (screenshot unavailable).`,
      };
    }
  };
}

/** Build all os.* control tools. Returns an array of ToolDefinition to register. */
export function createOsControlToolset(resolver?: OsControlResolver): ToolDefinition[] {
  const r = resolver ?? createOsControlResolver(new SandboxManager());

  const screenshot: ToolDefinition<OsSandboxTargetInput> = {
    name: "os.screenshot",
    displayName: "OS Screenshot",
    description:
      "Capture the full desktop of a running OS sandbox (Linux desktop or Windows VM) as a PNG image.",
    parameters: {
      type: "object",
      properties: {
        containerName: {
          type: "string",
          description:
            "Container name of the OS sandbox. Omit to use the most recently started running sandbox.",
        },
      },
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: async (input) => {
      let binding;
      try {
        binding = await r.resolve(input.containerName);
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      let shot: OsScreenshot;
      try {
        shot = await binding.driver.screenshot();
      } catch (err) {
        return {
          ok: false,
          message: `Screenshot failed on sandbox "${binding.containerName}": ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      return ok(`Captured desktop of sandbox "${binding.containerName}".`, {
        screenshot: { pngBase64: shot.png.toString("base64"), width: shot.width, height: shot.height },
      });
    },
  };

  const click: ToolDefinition<ClickInput> = {
    name: "os.click",
    displayName: "OS Click",
    description:
      "Move the cursor to (x, y) on the OS sandbox desktop and click a mouse button. Captures a screenshot after the action.",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Target OS sandbox container name." },
        x: { type: "number", description: "Cursor x coordinate." },
        y: { type: "number", description: "Cursor y coordinate." },
        button: { type: "string", enum: ["left", "middle", "right"], description: "Mouse button. Default left." },
        clicks: { type: "number", description: "Number of clicks. Default 1." },
      },
      required: ["x", "y"],
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: makeActionTool(
      r,
      "Click",
      (driver, _containerName, input) =>
        driver.click(
          input.x as number,
          input.y as number,
          { button: (input.button as "left" | "middle" | "right") ?? "left", clicks: input.clicks as number | undefined },
        ),
    ),
  };

  const mouse: ToolDefinition<MouseInput> = {
    name: "os.mouse",
    displayName: "OS Mouse Move",
    description: "Move the cursor to (x, y) on the OS sandbox desktop without clicking.",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Target OS sandbox container name." },
        x: { type: "number", description: "Cursor x coordinate." },
        y: { type: "number", description: "Cursor y coordinate." },
      },
      required: ["x", "y"],
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: makeActionTool(r, "Mouse move", (driver, _c, input) =>
      driver.mouseMove(input.x as number, input.y as number),
    ),
  };

  const type: ToolDefinition<TypeInput> = {
    name: "os.type",
    displayName: "OS Type",
    description: "Type literal text at the currently focused control on the OS sandbox desktop.",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Target OS sandbox container name." },
        text: { type: "string", description: "Text to type." },
        delayMs: { type: "number", description: "Delay between keystrokes in ms." },
      },
      required: ["text"],
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: makeActionTool(r, "Type", (driver, _c, input) =>
      driver.type(input.text as string, { delayMs: input.delayMs as number | undefined }),
    ),
  };

  const keyboard: ToolDefinition<KeyboardInput> = {
    name: "os.keyboard",
    displayName: "OS Keyboard Shortcut",
    description:
      'Send a keyboard shortcut on the OS sandbox desktop, e.g. "ctrl+c", "alt+tab", "super+d", "ctrl+shift+t".',
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Target OS sandbox container name." },
        combo: { type: "string", description: "Shortcut combination, e.g. 'ctrl+c'." },
        holdMs: { type: "number", description: "Optional hold duration in ms (keydown + keyup)." },
      },
      required: ["combo"],
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: makeActionTool(r, "Keyboard", (driver, _c, input) =>
      driver.key(input.combo as string, { holdMs: input.holdMs as number | undefined }),
    ),
  };

  const scroll: ToolDefinition<ScrollInput> = {
    name: "os.scroll",
    displayName: "OS Scroll",
    description: "Scroll the OS sandbox desktop viewport up, down, left, or right.",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Target OS sandbox container name." },
        x: { type: "number", description: "Optional cursor x before scrolling." },
        y: { type: "number", description: "Optional cursor y before scrolling." },
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction. Default down." },
        amount: { type: "number", description: "Number of wheel steps. Default 1." },
      },
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: makeActionTool(r, "Scroll", (driver, _c, input) =>
      driver.scroll({
        x: input.x as number | undefined,
        y: input.y as number | undefined,
        direction: (input.direction as "up" | "down" | "left" | "right") ?? "down",
        amount: input.amount as number | undefined,
      }),
    ),
  };

  const exec: ToolDefinition<ExecInput> = {
    name: "os.exec",
    displayName: "OS Exec",
    description: "Run a command inside the OS sandbox and return its combined output.",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Target OS sandbox container name." },
        command: { type: "string", description: "The command to run." },
        cwd: { type: "string", description: "Optional working directory inside the OS." },
        env: {
          type: "object",
          description: "Optional extra environment variables (string values).",
        },
        timeoutMs: { type: "number", description: "Optional timeout in ms. Default 30000." },
      },
      required: ["command"],
    },
    tier: "core",
    category: "os",
    source: "builtin",
    execute: async (input) => {
      let binding;
      try {
        binding = await r.resolve(input.containerName);
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      try {
        const res = await binding.driver.exec(input.command, {
          cwd: input.cwd,
          env: input.env,
          timeoutMs: input.timeoutMs,
        });
        if (!res.ok) {
          return {
            ok: false,
            message: `Command exited with code ${res.exitCode}${res.timedOut ? " (timed out)" : ""}`,
            data: { output: res.output, exitCode: res.exitCode, containerName: binding.containerName },
          };
        }
        return ok(`Command completed on sandbox "${binding.containerName}".`, {
          output: res.output,
          exitCode: res.exitCode,
          containerName: binding.containerName,
        });
      } catch (err) {
        return {
          ok: false,
          message: `Exec failed on sandbox "${binding.containerName}": ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };

  const sandboxList: ToolDefinition = {
    name: "os.sandbox.list",
    displayName: "OS Sandbox List",
    description: "List running OS sandboxes (Linux desktop / Windows VM) with their type and connection details.",
    parameters: { type: "object", properties: {} },
    tier: "standard",
    category: "os",
    source: "builtin",
    execute: async () => {
      try {
        const sandboxes = await r.listSandboxes();
        return ok(`Found ${sandboxes.length} running OS sandbox(s).`, { sandboxes });
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  return [screenshot, click, mouse, type, keyboard, scroll, exec, sandboxList];
}
