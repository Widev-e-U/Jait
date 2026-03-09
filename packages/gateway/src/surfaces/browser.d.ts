import type { Surface, SurfaceStartInput, SurfaceState, SurfaceStopInput, SurfaceSnapshot } from "./contracts.js";
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
    navigate(url: string, signal?: AbortSignal): Promise<void>;
    click(selector: string, signal?: AbortSignal): Promise<void>;
    typeText(selector: string, text: string, signal?: AbortSignal): Promise<void>;
    scroll(x: number, y: number, signal?: AbortSignal): Promise<void>;
    select(selector: string, value: string, signal?: AbortSignal): Promise<void>;
    waitFor(selector: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;
    screenshot(path?: string, signal?: AbortSignal): Promise<string>;
    snapshot(signal?: AbortSignal): Promise<BrowserPageSnapshot>;
    close(): Promise<void>;
}
export interface BrowserSurfaceOptions {
    driverFactory?: () => Promise<BrowserDriver>;
}
export declare class BrowserSurface implements Surface {
    readonly id: string;
    private readonly options;
    readonly type: "browser";
    private _state;
    private _sessionId;
    private _startedAt;
    private _lastUrl;
    private _lastTitle;
    private _actionCount;
    private driver;
    onOutput?: (data: string) => void;
    onStateChange?: (state: SurfaceState) => void;
    constructor(id: string, options?: BrowserSurfaceOptions);
    get state(): SurfaceState;
    get sessionId(): string | null;
    start(input: SurfaceStartInput): Promise<void>;
    stop(_input?: SurfaceStopInput): Promise<void>;
    snapshot(): SurfaceSnapshot;
    navigate(url: string, signal?: AbortSignal): Promise<BrowserPageSnapshot>;
    describe(signal?: AbortSignal): Promise<string>;
    click(selector: string, signal?: AbortSignal): Promise<void>;
    typeText(selector: string, text: string, signal?: AbortSignal): Promise<void>;
    scroll(x: number, y: number, signal?: AbortSignal): Promise<void>;
    select(selector: string, value: string, signal?: AbortSignal): Promise<void>;
    waitFor(selector: string, timeoutMs: number, signal?: AbortSignal): Promise<void>;
    screenshot(path?: string, signal?: AbortSignal): Promise<string>;
    private captureSnapshotMeta;
    private requireDriver;
    private _setState;
}
export declare class BrowserSurfaceFactory {
    private readonly options;
    readonly type: "browser";
    constructor(options?: BrowserSurfaceOptions);
    create(id: string): BrowserSurface;
}
//# sourceMappingURL=browser.d.ts.map