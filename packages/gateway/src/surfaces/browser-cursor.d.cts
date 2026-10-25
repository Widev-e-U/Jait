export interface CursorPage {
  click: (selector: string) => Promise<void>;
  evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
  mouse?: { move: (x: number, y: number) => Promise<void> };
  locator?: (selector: string) => { first: () => {
    waitFor: (options: { state: "visible"; timeout: number }) => Promise<void>;
    scrollIntoViewIfNeeded: () => Promise<void>;
    boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  } };
}
export function clickWithVisibleCursor(page: CursorPage, selector: string, signal?: AbortSignal): Promise<void>;
