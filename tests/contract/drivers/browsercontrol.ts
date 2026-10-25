/** Test boundary fixtures only; Rust owns the scenarios and assertions. */
import { selectVisibleBrowserPage } from '../../../packages/gateway/src/surfaces/browser.ts';
import { clickWithVisibleCursor, type CursorPage } from '../../../packages/gateway/src/surfaces/browser-cursor.cjs';

type PageState = { id: string; visible?: boolean; focused?: boolean; closed?: boolean; fails?: boolean };
type Call = {
  op: string;
  pages?: PageState[];
  fallback?: string;
  selectors?: string[];
  noPointer?: boolean;
  noBox?: boolean;
  cancelled?: boolean;
  cancelAfterMoves?: number;
  waitError?: string;
  clickError?: string;
};

export async function dispatch(call: Call) {
  if (call.op === 'browsercontrol.visible') {
    const inspected: string[] = [];
    const pages = (call.pages ?? []).map(state => ({
      id: state.id,
      isClosed: () => !!state.closed,
      evaluate: async () => {
        inspected.push(state.id);
        if (state.fails) throw new Error('Tab is navigating');
        return { visible: !!state.visible, focused: !!state.focused };
      },
    }));
    const fallback = pages.find(page => page.id === call.fallback);
    if (!fallback) throw new Error('Missing fallback fixture');
    return { selected: (await selectVisibleBrowserPage(pages, fallback)).id, inspected };
  }
  if (call.op !== 'browsercontrol.cursor') throw new Error('Unknown browser control operation');
  const events: Record<string, unknown>[] = [];
  const controller = new AbortController();
  if (call.cancelled) controller.abort();
  let moves = 0;
  const page: CursorPage = {
    click: async selector => {
      events.push({ op: 'click', selector });
      if (call.clickError) throw new Error(call.clickError);
    },
    evaluate: async <T>() => {
      events.push({ op: 'install' });
      return undefined as T;
    },
    ...(call.noPointer ? {} : {
      mouse: { move: async (x: number, y: number) => {
        events.push({ op: 'move', x, y });
        moves++;
        if (moves === call.cancelAfterMoves) controller.abort();
      } },
      locator: (selector: string) => ({ first: () => ({
        waitFor: async () => {
          events.push({ op: 'wait', selector });
          if (call.waitError) throw new Error(call.waitError);
        },
        scrollIntoViewIfNeeded: async () => { events.push({ op: 'scroll', selector }); },
        boundingBox: async () => call.noBox ? null : { x: 80, y: 40, width: 40, height: 20 },
      }) }),
    }),
  };
  try {
    for (const selector of call.selectors ?? ['#sign-in']) {
      await clickWithVisibleCursor(page, selector, controller.signal);
    }
    return { events, error: null };
  } catch (error) {
    return { events, error: error instanceof Error ? error.message : String(error) };
  }
}
