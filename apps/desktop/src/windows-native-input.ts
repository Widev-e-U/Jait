import type { ComputerMouseButton, ComputerScrollDirection } from "@jait/shared";

/**
 * Low-level pointer/keyboard primitives for the Windows driver. Implemented
 * with koffi (N-API FFI to user32.dll) so input does not go through PowerShell
 * processes — moves become immediate and can be animated smoothly.
 *
 * koffi is imported lazily (dynamic import) so this module can be loaded on
 * any platform (typecheck/tests) without binding to a native Windows library;
 * `createWindowsInput` refuses to run off win32 before touching it.
 */
export interface WindowsInput {
  readonly label: string;
  getCursorPos(): { x: number; y: number };
  setCursorPos(x: number, y: number): void;
  mouseButton(button: ComputerMouseButton, down: boolean): void;
  scroll(direction: ComputerScrollDirection, amount: number): void;
  keyVirtual(code: number, down: boolean): void;
  typeUnicode(text: string): void;
  sleep(ms: number): Promise<void>;
}

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const WHEEL_DELTA = 120;

const MOUSE_BUTTON_FLAGS: Record<ComputerMouseButton, { down: number; up: number }> = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 },
};

interface IUser32 {
  func(prototype: string): (...args: unknown[]) => unknown;
}

function mouseEvent(flags: number, mouseData = 0) {
  return {
    type: INPUT_MOUSE,
    u: {
      mi: { dx: 0, dy: 0, mouseData, dwFlags: flags, time: 0, dwExtraInfo: 0 },
    },
  };
}

function keyEvent(vk: number, scan: number, flags: number) {
  return {
    type: INPUT_KEYBOARD,
    u: {
      ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 },
    },
  };
}

class KoffiWindowsInput implements WindowsInput {
  readonly label = "koffi-user32";

  private readonly getCursorPosFn: (pos: Record<string, number>) => boolean;
  private readonly setCursorPosFn: (x: number, y: number) => boolean;
  private readonly sendInputFn: (count: number, events: unknown[], size: number) => number;
  private readonly inputSize: number;

  private constructor(user32: IUser32, inputSize: number) {
    this.getCursorPosFn = user32.func(
      "bool __stdcall GetCursorPos(_Out_ JaitPOINT *pos)",
    ) as unknown as KoffiWindowsInput["getCursorPosFn"];
    this.setCursorPosFn = user32.func("bool __stdcall SetCursorPos(int x, int y)") as unknown as
      KoffiWindowsInput["setCursorPosFn"];
    this.sendInputFn = user32.func(
      "unsigned int __stdcall SendInput(unsigned int cInputs, JaitINPUT *pInputs, int cbSize)",
    ) as unknown as KoffiWindowsInput["sendInputFn"];
    this.inputSize = inputSize;
  }

  /** Loads user32 and registers the INPUT struct layouts exactly once. */
  static async create(): Promise<KoffiWindowsInput> {
    if (process.platform !== "win32") {
      throw new Error("Native Windows input is only available on win32");
    }
    const { load, struct, union, sizeof } = await import("koffi");
    struct("JaitPOINT", { x: "long", y: "long" });
    const MOUSEINPUT = struct("JaitMOUSEINPUT", {
      dx: "long",
      dy: "long",
      mouseData: "uint32_t",
      dwFlags: "uint32_t",
      time: "uint32_t",
      dwExtraInfo: "uintptr_t",
    });
    const KEYBDINPUT = struct("JaitKEYBDINPUT", {
      wVk: "uint16_t",
      wScan: "uint16_t",
      dwFlags: "uint32_t",
      time: "uint32_t",
      dwExtraInfo: "uintptr_t",
    });
    const HARDWAREINPUT = struct("JaitHARDWAREINPUT", {
      uMsg: "uint32_t",
      wParamL: "uint16_t",
      wParamH: "uint16_t",
    });
    struct("JaitINPUT", {
      type: "uint32_t",
      u: union({
        mi: MOUSEINPUT,
        ki: KEYBDINPUT,
        hi: HARDWAREINPUT,
      }),
    });
    const user32 = load("user32.dll") as unknown as IUser32;
    return new KoffiWindowsInput(user32, sizeof("JaitINPUT"));
  }

  getCursorPos(): { x: number; y: number } {
    const pos: Record<string, number> = { x: 0, y: 0 };
    if (!this.getCursorPosFn(pos)) throw new Error("GetCursorPos failed");
    return { x: pos.x ?? 0, y: pos.y ?? 0 };
  }

  setCursorPos(x: number, y: number): void {
    if (!this.setCursorPosFn(Math.round(x), Math.round(y))) {
      throw new Error(`SetCursorPos(${x}, ${y}) failed`);
    }
  }

  private send(events: unknown[]): void {
    const sent = this.sendInputFn(events.length, events, this.inputSize);
    if (sent !== events.length) {
      throw new Error(`SendInput only delivered ${sent}/${events.length} events`);
    }
  }

  mouseButton(button: ComputerMouseButton, down: boolean): void {
    const flags = MOUSE_BUTTON_FLAGS[button];
    this.send([mouseEvent(down ? flags.down : flags.up)]);
  }

  scroll(direction: ComputerScrollDirection, amount: number): void {
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "up" || direction === "right" ? 1 : -1;
    const raw = Math.round(amount * WHEEL_DELTA * sign);
    this.send([mouseEvent(horizontal ? 0x1000 : 0x0800, raw)]);
  }

  keyVirtual(code: number, down: boolean): void {
    this.send([keyEvent(code, 0, down ? 0 : KEYEVENTF_KEYUP)]);
  }

  typeUnicode(text: string): void {
    // Split into UTF-16 code units so surrogate pairs are sent as two
    // consecutive KEYEVENTF_UNICODE events, exactly as Windows expects.
    const units = text.split("");
    for (let i = 0; i < units.length; i += 16) {
      const chunk = units.slice(i, i + 16).flatMap((unit) => [
        keyEvent(0, unit.charCodeAt(0), KEYEVENTF_UNICODE),
        keyEvent(0, unit.charCodeAt(0), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
      ]);
      this.send(chunk);
    }
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Async factory: resolves a native user32-backed input implementation. */
export async function createWindowsInput(): Promise<WindowsInput> {
  return KoffiWindowsInput.create();
}