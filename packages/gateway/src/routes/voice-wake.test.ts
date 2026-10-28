import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerVoiceRoutes } from "./voice.js";

const review = vi.hoisted(() => vi.fn());
vi.mock("../voice/wake-candidate.js", () => ({ isWakeCandidate: review }));

describe("wake candidate endpoint", () => {
  it("requires authentication, respects a disabled decision tool, and rate-limits review", async () => {
    review.mockReset().mockResolvedValue(true);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-secret-for-voice-candidates" };
    let disabledTools: string[] = ["decision.evaluate"];
    const users = { getSettings: () => ({ apiKeys: { SYSTEM_ONE_MODEL: "test" }, disabledTools }) };
    registerVoiceRoutes(app, {} as any, {} as any, config, users as any);
    const token = await signAuthToken({ id: "user", username: "Alice" }, config.jwtSecret);
    const send = (authorization?: string) => app.inject({
      method: "POST", url: "/api/voice/wake-candidate", headers: authorization ? { authorization } : {},
      payload: { transcript: "Hey Jay, check the network" },
    });
    expect((await send()).statusCode).toBe(401);
    expect((await send(`Bearer ${token}`)).json()).toEqual({ activate: false });
    expect(review).not.toHaveBeenCalled();
    disabledTools = [];
    expect((await send(`Bearer ${token}`)).json()).toEqual({ activate: true });
    expect((await send(`Bearer ${token}`)).json()).toEqual({ activate: false });
    expect(review).toHaveBeenCalledOnce();
    await app.close();
  });
});
