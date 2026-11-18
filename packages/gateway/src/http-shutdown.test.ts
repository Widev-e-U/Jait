import { describe, expect, it, vi } from "vitest";
import { closeHttpServer } from "./http-shutdown.js";

describe("closeHttpServer", () => {
  it("drops idle keep-alive sockets instead of waiting on them", async () => {
    const closeIdleConnections = vi.fn();
    const closeAllConnections = vi.fn();
    const app = {
      close: () => Promise.resolve(),
      server: { closeIdleConnections, closeAllConnections },
    };

    await closeHttpServer(app, 5_000);

    expect(closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(closeAllConnections).not.toHaveBeenCalled();
  });

  it("force-closes remaining sockets once the grace window expires", async () => {
    let finish: () => void = () => {};
    const server = {
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(() => finish()),
    };
    const app = {
      close: () => new Promise<void>((resolve) => { finish = resolve; }),
      server,
    };

    await closeHttpServer(app, 10);

    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
  });

  it("still resolves when the underlying server exposes no socket helpers", async () => {
    const close = vi.fn(() => Promise.resolve());

    await expect(closeHttpServer({ close })).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
