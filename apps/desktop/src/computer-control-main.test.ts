import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dialog: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  execute: vi.fn(),
  load: vi.fn(),
  destroy: vi.fn(),
  frame: null as null | ((x: number, y: number) => void),
}));
vi.mock("electron", () => ({
  dialog: { showMessageBox: mocks.dialog },
  globalShortcut: { register: mocks.register, unregister: mocks.unregister },
  screen: {
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1280, height: 720 } }],
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    screenToDipPoint: (point: { x: number; y: number }) => ({ x: point.x / 1.5, y: point.y / 1.5 }),
  },
  BrowserWindow: class {
    webContents = { executeJavaScript: mocks.execute };
    loadURL = mocks.load;
    destroy = mocks.destroy;
    isDestroyed() { return false; }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    on() {}
    showInactive() {}
  },
}));
vi.mock("./windows-computer-control.js", () => ({
  WindowsComputerDriver: class {
    constructor(options: { onGlideFrame: (x: number, y: number) => void }) {
      mocks.frame = options.onGlideFrame;
    }
  },
}));
import { ComputerControlController } from "./computer-control-main.js";

describe("computer control lifecycle", () => {
  let controller: ComputerControlController;
  beforeEach(() => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    mocks.dialog.mockReset().mockResolvedValue({ response: 0 });
    mocks.register.mockReset().mockReturnValue(true);
    mocks.load.mockReset().mockResolvedValue(undefined);
    mocks.execute.mockReset().mockResolvedValue(undefined);
    mocks.destroy.mockClear();
    controller = new ComputerControlController(() => null);
  });
  afterEach(() => {
    controller.stop();
    vi.restoreAllMocks();
  });
  const start = () => controller.handle("computer.session", { action: "start", sessionId: "test" });

  it("converts native cursor frames to display-independent overlay coordinates", async () => {
    expect((await start()).ok).toBe(true);
    mocks.frame!(900, 600);
    expect(mocks.execute).toHaveBeenLastCalledWith("window.jaitMove?.(600, 400)", true);
  });

  it("returns startup exceptions as meaningful tool failures", async () => {
    mocks.register.mockImplementation(() => { throw new Error("Shortcut service unavailable"); });
    await expect(start()).resolves.toMatchObject({ ok: false, message: expect.stringContaining("Shortcut service unavailable") });
  });

  it("does not activate after a pending approval is stopped", async () => {
    let approve!: (value: { response: number }) => void;
    mocks.dialog.mockImplementation(() => new Promise((resolve) => { approve = resolve; }));
    const pending = start();
    const options = mocks.dialog.mock.calls[0]![0] as { signal: AbortSignal };
    controller.stop("test");
    expect(options.signal.aborted).toBe(true);
    approve({ response: 0 });
    expect((await pending).ok).toBe(false);
    expect((await controller.handle("computer.session", { action: "status" })).data).toBeNull();
  });

  it("destroys the overlay if loading fails", async () => {
    mocks.load.mockRejectedValue(new Error("Overlay load failed"));
    expect((await start()).ok).toBe(false);
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("rejects overlapping starts while approval is pending", async () => {
    let approve!: (value: { response: number }) => void;
    mocks.dialog.mockImplementation(() => new Promise((resolve) => { approve = resolve; }));
    const pending = start();
    const second = controller.handle("computer.session", { action: "start", sessionId: "second" });
    // A second dialog must never be opened.
    expect(mocks.dialog).toHaveBeenCalledOnce();
    approve({ response: 0 });
    expect((await pending).ok).toBe(true);
    expect((await second).ok).toBe(false);
  });
});
