/** Test-only differential driver for the subscription usage fetchers.
 *
 * Runs the real TypeScript exports against a fake `fetch`, so Rust owns every assertion and
 * the reference implementation is never re-implemented here. No live subscription service is
 * contacted and no real key or cookie is used.
 *
 * `op` must start with `nativesubscriptionusage.`; `drivers/internals.ts` resolves the prefix
 * to this module and calls `dispatch`.
 */
import {
  fetchOllamaSettingsUsage,
  fetchOpenCodeGoUsage,
  normalizeOllamaSession,
  parseOllamaSettingsUsage,
} from "../../../packages/gateway/src/services/subscription-usage-fetchers.ts";

interface Scenario {
  status?: number;
  chunks?: string[];
  byteChunks?: number[][];
  failAfter?: number | null;
  readError?: string;
  cancelError?: string | null;
  noBody?: boolean;
  fetchError?: string;
  repeatText?: string;
  repeatCount?: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The exact surface `fetchOllamaSettingsUsage` observes: `status`, `ok`, `body.getReader()`.
 *
 * A real `Response` cannot expose `reader.cancel()`: cancelling a reader whose stream is
 * already closed or errored is a no-op, so a duck-typed reader is the only way to observe
 * whether `cancel()` ran and whether a rejected cancel overrides the terminal outcome.
 */
function fakeSettingsResponse(scenario: Scenario, events: string[]): unknown {
  const status = scenario.status ?? 200;
  const chunks = scenario.byteChunks?.map(chunk => new Uint8Array(chunk)) ?? scenario.chunks?.map(chunk => new TextEncoder().encode(chunk)) ?? [];
  if (scenario.repeatText && scenario.repeatCount) chunks.push(new TextEncoder().encode(scenario.repeatText.repeat(scenario.repeatCount)));
  const failAfter = scenario.failAfter ?? null;
  let index = 0;
  return {
    status,
    ok: status >= 200 && status < 300,
    body: scenario.noBody
      ? null
      : {
          getReader: () => ({
            async read() {
              if (failAfter !== null && index >= failAfter) {
                events.push("read-error");
                throw new Error(scenario.readError ?? "stream failed");
              }
              if (index >= chunks.length) {
                events.push("end");
                return { done: true, value: undefined };
              }
              events.push("read");
              return { done: false, value: chunks[index++] };
            },
            async cancel() {
              events.push("cancel");
              if (scenario.cancelError) throw new Error(scenario.cancelError);
            },
          }),
        },
  };
}

/** A real `Response` for the JSON path, so `response.json()` keeps Bun's own semantics. */
function respond(scenario: Scenario, events: string[]): Response {
  const status = scenario.status ?? 200;
  if (scenario.noBody) return new Response(null, { status });
  const chunks = scenario.byteChunks?.map(chunk => new Uint8Array(chunk)) ?? scenario.chunks?.map(chunk => new TextEncoder().encode(chunk)) ?? [];
  if (scenario.repeatText && scenario.repeatCount) chunks.push(new TextEncoder().encode(scenario.repeatText.repeat(scenario.repeatCount)));
  const failAfter = scenario.failAfter ?? null;
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== null && index >= failAfter) {
        events.push("read-error");
        controller.error(new Error(scenario.readError ?? "stream failed"));
        return;
      }
      if (index >= chunks.length) {
        events.push("end");
        controller.close();
        return;
      }
      events.push("read");
      controller.enqueue(chunks[index++]);
    },
    cancel() {
      events.push("cancel");
      if (scenario.cancelError) throw new Error(scenario.cancelError);
    },
  }, { highWaterMark: 0 });
  return new Response(stream, { status });
}

interface Trace {
  ok: boolean;
  value?: unknown;
  error?: string;
  request?: unknown;
  events: string[];
}

async function capture(
  scenario: Scenario,
  run: () => Promise<unknown>,
  respondWith: (scenario: Scenario, events: string[]) => unknown = respond,
): Promise<Trace> {
  const events: string[] = [];
  let request: unknown;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const headers =
      init.headers && typeof init.headers === "object"
        ? Object.entries(init.headers as Record<string, string>)
        : [];
    request = {
      url: String(input),
      method: init.method ?? null,
      redirect: init.redirect ?? null,
      headers,
      signalIsAbortSignal: init.signal instanceof AbortSignal,
      signalAborted: init.signal?.aborted ?? null,
      signalReason: init.signal?.reason?.name ?? null,
    };
    if (scenario.fetchError) throw new Error(scenario.fetchError);
    return respondWith(scenario, events);
  }) as typeof fetch;
  try {
    const value = await run();
    return { ok: true, value: value ?? null, request, events };
  } catch (error) {
    return { ok: false, error: message(error), request, events };
  } finally {
    globalThis.fetch = original;
  }
}

export async function dispatch(call: Record<string, any>): Promise<unknown> {
  switch (call.op) {
    case "nativesubscriptionusage.parse": {
      const timezone = process.env.TZ;
      try {
        if (typeof call.timezone === "string") process.env.TZ = call.timezone;
        return { ok: true, value: parseOllamaSettingsUsage(call.depth ? "<a>".repeat(call.depth) + call.html + "</a>".repeat(call.depth) : call.html) };
      } catch (error) {
        return { ok: false, error: message(error) };
      } finally {
        if (timezone === undefined) delete process.env.TZ;
        else process.env.TZ = timezone;
      }
    }
    case "nativesubscriptionusage.normalize":
      try {
        return { ok: true, value: normalizeOllamaSession(call.value) };
      } catch (error) {
        return { ok: false, error: message(error) };
      }
    case "nativesubscriptionusage.dates":
      return (call.values as string[]).map((value) => {
        const parsed = Date.parse(value);
        const finite = Number.isFinite(parsed);
        return {
          value,
          parse: finite ? parsed : null,
          iso: finite ? new Date(parsed).toISOString() : null,
        };
      });
    case "nativesubscriptionusage.opencode":
      return await capture(call.scenario ?? {}, () => fetchOpenCodeGoUsage(call.apiKey));
    case "nativesubscriptionusage.ollama":
      return await capture(
        call.scenario ?? {},
        () => fetchOllamaSettingsUsage(call.session),
        fakeSettingsResponse,
      );
    default:
      throw new Error(`unknown nativesubscriptionusage op: ${String(call.op)}`);
  }
}
