import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretInputService } from "./secret-input.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("SecretInputService", () => {
  it("returns a remembered secret before emitting a prompt request", async () => {
    const onRequest = vi.fn();
    const resolveRememberedSecret = vi.fn(() => "saved-password");
    const service = new SecretInputService({
      defaultTimeoutMs: 10,
      onRequest,
      resolveRememberedSecret,
    });

    const value = await service.requestSecret({
      sessionId: "session-remembered",
      userId: "user-1",
      title: "Administrator password",
      prompt: "Password for sudo",
      rememberable: true,
      secretType: "elevated-password",
      secretKey: "linux:current-user",
    });

    expect(value).toBe("saved-password");
    expect(resolveRememberedSecret).toHaveBeenCalledWith({
      userId: "user-1",
      secretType: "elevated-password",
      secretKey: "linux:current-user",
    });
    expect(onRequest).not.toHaveBeenCalled();
    expect(service.listPending()).toEqual([]);
  });
  it("lists pending requests by session and user visibility", async () => {
    const service = new SecretInputService();

    const ownedPromise = service.requestSecret({
      sessionId: "session-1",
      userId: "user-1",
      title: "SSH password",
      prompt: "Password for host-a",
      requestedBy: "ssh.run",
    });
    const sharedPromise = service.requestSecret({
      sessionId: "session-2",
      title: "Admin password",
      prompt: "Password for sudo",
      requestedBy: "elevated.run",
    });

    const [ownedRequest] = service.listPending("session-1", "user-1");
    const [sharedRequest] = service.listPending("session-2", "user-2");

    expect(ownedRequest).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
      title: "SSH password",
      status: "pending",
    });
    expect(sharedRequest).toMatchObject({
      sessionId: "session-2",
      userId: null,
      title: "Admin password",
      status: "pending",
    });
    expect(service.listPending(undefined, "user-2")).toHaveLength(1);

    expect(service.submit(ownedRequest!.id, "secret-1", "user-1")).toBe(true);
    expect(service.cancel(sharedRequest!.id, "user-2")).toBe(true);

    await expect(ownedPromise).resolves.toBe("secret-1");
    await expect(sharedPromise).resolves.toBeNull();
  });

  it("rejects submit and cancel when a user-bound request is resolved by a different or missing user", async () => {
    vi.useFakeTimers();
    const service = new SecretInputService({ defaultTimeoutMs: 50 });

    const secretPromise = service.requestSecret({
      sessionId: "session-1",
      userId: "user-1",
      title: "SSH password",
      prompt: "Password for host-a",
    });
    const [request] = service.listPending("session-1", "user-1");

    expect(service.submit(request!.id, "secret-1")).toBe(false);
    expect(service.cancel(request!.id, "user-2")).toBe(false);
    expect(service.listPending("session-1", "user-1")).toHaveLength(1);

    vi.advanceTimersByTime(50);
    await expect(secretPromise).resolves.toBeNull();
  });

  it("resolves timed out requests and emits the final timeout status", async () => {
    vi.useFakeTimers();
    const resolvedStatuses: string[] = [];
    const service = new SecretInputService({
      defaultTimeoutMs: 25,
      onResolved: (request) => {
        resolvedStatuses.push(request.status);
      },
    });

    const secretPromise = service.requestSecret({
      sessionId: "session-1",
      title: "SSH password",
      prompt: "Password for host-a",
    });

    expect(service.listPending("session-1")).toHaveLength(1);

    vi.advanceTimersByTime(25);

    await expect(secretPromise).resolves.toBeNull();
    expect(service.listPending("session-1")).toHaveLength(0);
    expect(resolvedStatuses).toEqual(["timeout"]);
  });
});
