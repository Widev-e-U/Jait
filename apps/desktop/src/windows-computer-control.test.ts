import { describe, expect, it, vi } from "vitest";
import type {
  ComputerMouseButton,
  ComputerScrollDirection,
} from "@jait/shared";
import {
  WindowsComputerDriver,
  escapeWindowsSendKeysText,
  virtualKeysForCombo,
} from "./windows-computer-control.js";
import type { WindowsInput } from "./windows-native-input.js";

class FakeInput implements WindowsInput {
  readonly label = "fake-input";
  readonly positions: Array<{ x: number; y: number }> = [];
  readonly buttons: string[] = [];
  readonly keys: Array<{ code: number; down: boolean }> = [];
  readonly typed: string[] = [];
  readonly scrolls: string[] = [];

  constructor(private cursor: { x: number; y: number } = { x: 0, y: 0 }) {}

  getCursorPos(): { x: number; y: number } {
    return { ...this.cursor };
  }

  setCursorPos(x: number, y: number): void {
    this.positions.push({ x, y });
    this.cursor = { x, y };
  }

  mouseButton(button: ComputerMouseButton, down: boolean): void {
    this.buttons.push(`${down ? "down" : "up"}:${button}`);
  }

  keyVirtual(code: number, down: boolean): void {
    this.keys.push({ code, down });
  }

  typeUnicode(text: string): void {
    this.typed.push(text);
  }

  scroll(direction: ComputerScrollDirection, amount: number): void {
    this.scrolls.push(`${direction}:${amount}`);
  }

  async sleep(_ms: number): Promise<void> {}
}

describe("WindowsComputerDriver", () => {
  it("escapes SendKeys metacharacters while preserving literal text", () => {
    expect(escapeWindowsSendKeysText("hello + {jait}\nnext\tcell"))
      .toBe("hello {+} {{}jait{}}{ENTER}next{TAB}cell");
  });

  it("maps modifier, letter, navigation, and function key combos", () => {
    expect(virtualKeysForCombo("win+r")).toEqual([0x5b, 0x52]);
    expect(virtualKeysForCombo("ctrl+shift+t")).toEqual([0x11, 0x10, 0x54]);
    expect(virtualKeysForCombo("enter")).toEqual([0x0d]);
    expect(virtualKeysForCombo("f12")).toEqual([0x7b]);
    expect(() => virtualKeysForCombo("ctrl+banana")).toThrow(/Unsupported key/);
  });

  it("does not initialize native input for screenshot-only sessions", async () => {
    const run = vi.fn(async () => JSON.stringify({
      pngBase64: "cG5n",
      width: 3840,
      height: 2160,
      originX: -1920,
      originY: 0,
    }));
    const driver = new WindowsComputerDriver({ runPowerShell: run });

    await expect(driver.screenshot()).resolves.toEqual({
      pngBase64: "cG5n",
      width: 3840,
      height: 2160,
      originX: -1920,
      originY: 0,
    });
  });

  it("glides the cursor along an eased multi-step path instead of teleporting", async () => {
    const input = new FakeInput({ x: 0, y: 0 });
    const frames: Array<{ x: number; y: number }> = [];
    const driver = new WindowsComputerDriver({
      inputFactory: () => input,
      onGlideFrame: (x, y) => frames.push({ x, y }),
    });

    await driver.move(300, 0);

    const xs = input.positions.map((point) => point.x);
    expect(xs.length).toBeGreaterThanOrEqual(5);
    expect(xs[xs.length - 1]).toBe(300);
    // Monotonic travel along the straight-line path (ease changes speed, not direction).
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]!);
    }
    // Ease-in-out: little ground is covered in the opening quarter...
    expect(xs[Math.floor(xs.length / 4)]!).toBeLessThan(45);
    // ...but roughly half the distance is covered by the halfway frame.
    expect(xs[Math.floor(xs.length / 2)]!).toBeGreaterThan(135);
    // Overlay frames mirror exactly the positions written to the OS cursor.
    expect(frames).toEqual(input.positions);
    expect(frames[frames.length - 1]).toEqual({ x: 300, y: 0 });
  });

  it("moves the overlay frame-by-frame and clicks with press/release pairs", async () => {
    const input = new FakeInput({ x: 500, y: 500 });
    const driver = new WindowsComputerDriver({ inputFactory: () => input });

    await driver.click(520, 500, "right", 2);

    expect(input.positions[input.positions.length - 1]).toEqual({ x: 520, y: 500 });
    expect(input.buttons).toEqual(["down:right", "up:right", "down:right", "up:right"]);
  });

  it("sends unicode text, reverse-released key combos, and scrolls natively", async () => {
    const input = new FakeInput();
    const driver = new WindowsComputerDriver({ inputFactory: () => input });

    await driver.type("héllo 👋");
    await driver.key("win+r");
    await driver.scroll("up", 4);

    expect(input.typed).toEqual(["héllo 👋"]);
    expect(input.keys).toEqual([
      { code: 0x5b, down: true },
      { code: 0x52, down: true },
      { code: 0x52, down: false },
      { code: 0x5b, down: false },
    ]);
    expect(input.scrolls).toEqual(["up:4"]);
  });

  it("surfaces native input init errors but retries on the next command", async () => {
    const input = new FakeInput({ x: 10, y: 10 });
    let attempts = 0;
    const driver = new WindowsComputerDriver({
      inputFactory: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("koffi unavailable");
        return input;
      },
    });

    await expect(driver.click(10, 10, "left", 1)).rejects.toThrow("koffi unavailable");
    await driver.click(10, 10, "left", 1);

    expect(input.buttons).toEqual(["down:left", "up:left"]);
    expect(attempts).toBe(2);
  });
});