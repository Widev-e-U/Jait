/**
 * Node's http.Server — and therefore Fastify — only resolves `close()` once
 * every accepted socket has ended. A single keep-alive connection from an HTTP
 * client (the desktop host's fetch pool, the packaged release smoke test, a
 * browser tab, a health check) is enough to hold that promise open far longer
 * than any shutdown should take.
 *
 * During gateway shutdown that looks exactly like a hang: the process sits in
 * `server.close()` until the force-exit watchdog fires and terminates with a
 * non-zero code. The Windows packaging job asserts a clean zero exit, so one
 * idle socket used to fail packaging and skip the entire GitHub release.
 *
 * So: close idle sockets immediately, keep a short grace window for requests
 * that are genuinely in flight, then drop whatever is still left.
 */

export interface RawHttpServer {
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}

export interface ClosableApp {
  close: () => Promise<unknown> | void;
  server?: RawHttpServer;
}

/**
 * Close a Fastify (or bare http.Server-shaped) app without waiting on idle
 * keep-alive sockets. `graceMs` bounds how long in-flight requests may finish
 * before their sockets are closed too.
 */
export async function closeHttpServer(app: ClosableApp, graceMs = 1_000): Promise<void> {
  const raw = app.server;
  const closed = Promise.resolve(app.close());
  raw?.closeIdleConnections?.();
  const force = setTimeout(() => raw?.closeAllConnections?.(), graceMs);
  force.unref?.();
  try {
    await closed;
  } finally {
    clearTimeout(force);
  }
}
