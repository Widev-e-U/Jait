export interface BrowserClickGuard {
  documentUrl: string;
  documentTimeOrigin: number;
  tagName: string;
  name: string;
  text: string;
  inputType?: string;
  option?: { value: string; label: string };
}
interface CursorHandle {
  evaluate: <T>(fn: (...args: any[]) => T, arg?: BrowserClickGuard) => Promise<T>;
  click: (options: { timeout: number }) => Promise<void>;
  dispose: () => Promise<void>;
}
export interface CursorPage {
  click: (selector: string) => Promise<void>;
  context?: () => { waitForEvent?: (event: "page", options: { timeout: number }) => Promise<{ waitForLoadState?: (state: "domcontentloaded", options: { timeout: number }) => Promise<void> }> };
  evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
  mouse?: { move: (x: number, y: number) => Promise<void> };
  locator?: (selector: string) => {
    count: () => Promise<number>;
    elementHandle: () => Promise<CursorHandle | null>;
    first: () => {
      waitFor: (options: { state: "visible"; timeout: number }) => Promise<void>;
      evaluate: <T>(fn: (element: any) => T) => Promise<T>;
    };
  };
}
export function clickWithVisibleCursor(page: CursorPage, selector: string, signal?: AbortSignal, guard?: BrowserClickGuard): Promise<void>;

export function guardedFieldAction(page: CursorPage, selector: string, value: string, operation: "fill" | "select", signal: AbortSignal | undefined, guard: BrowserClickGuard): Promise<void>;


/** Page-side snapshot collector; returns a BrowserPageSnapshot without documentUrl. Serialized into the page by Playwright. */
export function collectPageSnapshot(requestedTarget?: string): unknown;
