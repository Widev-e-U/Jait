import type {
  Surface,
  SurfaceStartInput,
  SurfaceState,
  SurfaceStopInput,
  SurfaceSnapshot,
} from "./contracts.js";

export interface BrowserInteractiveElement {
  role?: string;
  name?: string;
  text?: string;
  selector?: string;
}

export interface BrowserPageSnapshot {
  url: string;
  title: string;
  text: string;
  elements: BrowserInteractiveElement[];
}

export interface BrowserDriver {
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  typeText(selector: string, text: string): Promise<void>;
  scroll(x: number, y: number): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  waitFor(selector: string, timeoutMs: number): Promise<void>;
  screenshot(path?: string): Promise<string>;
  snapshot(): Promise<BrowserPageSnapshot>;
  close(): Promise<void>;
}

export interface BrowserSurfaceOptions {
  driverFactory?: () => Promise<BrowserDriver>;
}

export class BrowserSurface implements Surface {
  readonly type = "browser" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _lastUrl = "";
  private _lastTitle = "";
  private _actionCount = 0;
  private driver: BrowserDriver | null = null;

  onOutput?: (data: string) => void;
  onStateChange?: (state: SurfaceState) => void;

  constructor(
    public readonly id: string,
    private readonly options: BrowserSurfaceOptions = {},
  ) {}

  get state(): SurfaceState {
    return this._state;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  async start(input: SurfaceStartInput): Promise<void> {
    if (this._state === "running") return;
    this._setState("starting");
    this._sessionId = input.sessionId;
    this._startedAt = new Date().toISOString();

    try {
      const factory = this.options.driverFactory ?? createPlaywrightDriver;
      this.driver = await factory();
      this._setState("running");
    } catch (err) {
      this._setState("error");
      throw err;
    }
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    this._setState("stopping");
    await this.driver?.close();
    this.driver = null;
    this._setState("stopped");
  }

  snapshot(): SurfaceSnapshot {
    return {
      id: this.id,
      type: this.type,
      state: this._state,
      sessionId: this._sessionId ?? "",
      startedAt: this._startedAt ?? undefined,
      metadata: {
        currentUrl: this._lastUrl || null,
        title: this._lastTitle || null,
        actionCount: this._actionCount,
      },
    };
  }

  async navigate(url: string): Promise<BrowserPageSnapshot> {
    const driver = this.requireDriver();
    await driver.navigate(url);
    this._actionCount++;
    const snap = await driver.snapshot();
    this.captureSnapshotMeta(snap);
    this.onOutput?.(`navigate ${snap.url}`);
    return snap;
  }

  async describe(): Promise<string> {
    const snap = await this.requireDriver().snapshot();
    this.captureSnapshotMeta(snap);
    const lines = [
      `URL: ${snap.url}`,
      `Title: ${snap.title || "(untitled)"}`,
      "",
      "Text:",
      snap.text.trim() || "(no textual content)",
      "",
      "Interactive elements:",
      ...snap.elements.slice(0, 30).map((el, i) => {
        const parts = [el.role ?? "element", el.name, el.text].filter(Boolean).join(" — ");
        return `${i + 1}. ${parts || "unnamed"}${el.selector ? ` [${el.selector}]` : ""}`;
      }),
    ];
    return lines.join("\n").trim();
  }

  async click(selector: string): Promise<void> {
    await this.requireDriver().click(selector);
    this._actionCount++;
  }

  async typeText(selector: string, text: string): Promise<void> {
    await this.requireDriver().typeText(selector, text);
    this._actionCount++;
  }

  async scroll(x: number, y: number): Promise<void> {
    await this.requireDriver().scroll(x, y);
    this._actionCount++;
  }

  async select(selector: string, value: string): Promise<void> {
    await this.requireDriver().select(selector, value);
    this._actionCount++;
  }

  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    await this.requireDriver().waitFor(selector, timeoutMs);
    this._actionCount++;
  }

  async screenshot(path?: string): Promise<string> {
    this._actionCount++;
    return this.requireDriver().screenshot(path);
  }

  private captureSnapshotMeta(snap: BrowserPageSnapshot): void {
    this._lastUrl = snap.url;
    this._lastTitle = snap.title;
  }

  private requireDriver(): BrowserDriver {
    if (!this.driver || this._state !== "running") {
      throw new Error("Browser surface is not running");
    }
    return this.driver;
  }

  private _setState(next: SurfaceState): void {
    this._state = next;
    this.onStateChange?.(next);
  }
}

export class BrowserSurfaceFactory {
  readonly type = "browser" as const;

  constructor(private readonly options: BrowserSurfaceOptions = {}) {}

  create(id: string): BrowserSurface {
    return new BrowserSurface(id, this.options);
  }
}

async function createPlaywrightDriver(): Promise<BrowserDriver> {
  throw new Error(
    "No browser driver configured. Provide BrowserSurfaceFactory({ driverFactory }) to enable browser tools.",
  );
}
