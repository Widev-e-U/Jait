import { describe, expect, it } from "vitest";
import {
  createChannelRemindTool,
  createChannelSendTool,
  cronForLocalStamp,
  parseChannelSessionId,
  parseLocalStamp,
  type ChannelToolDeps,
} from "./channel-tools.js";
import type { ToolContext } from "./contracts.js";

const NOW = new Date("2026-08-08T09:00:00Z");

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}

function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}

describe("channel session ids", () => {
  it("splits at the first separator so colons in a chat id survive", () => {
    expect(parseChannelSessionId("channel:telegram:4242")).toEqual({
      channelId: "telegram",
      conversationId: "4242",
    });
    expect(parseChannelSessionId("channel:whatsapp:4915112345678@s.whatsapp.net:12")).toEqual({
      channelId: "whatsapp",
      conversationId: "4915112345678@s.whatsapp.net:12",
    });
  });

  it("rejects anything that is not a channel session", () => {
    expect(parseChannelSessionId("web-chat-42")).toBeNull();
    expect(parseChannelSessionId("channel:telegram")).toBeNull();
    expect(parseChannelSessionId("channel:telegram:")).toBeNull();
    expect(parseChannelSessionId(undefined)).toBeNull();
  });
});

describe("local time parsing", () => {
  it("reads a wall clock without shifting it into another zone", () => {
    expect(parseLocalStamp("2026-08-09T05:00")).toEqual({
      year: 2026, month: 8, day: 9, hour: 5, minute: 0,
    });
  });

  it("refuses stamps that carry an offset, which would mean another clock", () => {
    expect(parseLocalStamp("2026-08-09T05:00:00Z")).toBeNull();
    expect(parseLocalStamp("2026-08-09T05:00+02:00")).toBeNull();
  });

  it("refuses impossible times", () => {
    expect(parseLocalStamp("2026-13-09T05:00")).toBeNull();
    expect(parseLocalStamp("2026-08-09T25:00")).toBeNull();
  });

  it("turns a stamp into the cron minute it fires on", () => {
    expect(cronForLocalStamp({ year: 2026, month: 8, day: 9, hour: 5, minute: 0 })).toBe("0 5 9 8 *");
  });
});

describe("channel.send", () => {
  it("delivers to the chat the calling turn belongs to", async () => {
    const { deps: d, delivered } = deps();
    const result = await createChannelSendTool(d).execute({ text: "done" }, context());

    expect(result.ok).toBe(true);
    expect(delivered).toEqual([
      { channelId: "telegram", conversationId: "4242", text: "done", prompt: undefined },
    ]);
  });

  it("prefers an explicit target over the session's", async () => {
    const { deps: d, delivered } = deps();
    await createChannelSendTool(d).execute(
      { text: "hi", channelId: "whatsapp", conversationId: "999" },
      context(),
    );
    expect(delivered[0]).toMatchObject({ channelId: "whatsapp", conversationId: "999" });
  });

  it("fails rather than guessing when there is no chat to send to", async () => {
    const { deps: d, delivered } = deps();
    const result = await createChannelSendTool(d).execute({ text: "hi" }, context({ sessionId: "web-1" }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no target chat/i);
    expect(delivered).toHaveLength(0);
  });

  it("reports a failed delivery instead of throwing into the agent loop", async () => {
    const { deps: d } = deps({
      channels: { deliver: async () => { throw new Error("channel is stopped"); } },
    });
    const result = await createChannelSendTool(d).execute({ text: "hi" }, context());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/channel is stopped/);
  });
});

describe("channel.remind", () => {
  it("schedules a one-off against the chat's wall clock", async () => {
    const { deps: d, created } = deps();
    const result = await createChannelRemindTool(d).execute(
      { at: "2026-08-09T05:00", text: "Anlage prüfen" },
      context({ userId: "user-1" }),
    );

    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      cron: "0 5 9 8 *",
      toolName: "channel.send",
      userId: "user-1",
      sessionId: "channel:telegram:4242",
    });
    expect(created[0]!["input"]).toMatchObject({
      channelId: "telegram",
      conversationId: "4242",
      text: "Anlage prüfen",
      __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true },
    });
  });

  it("keeps a recurring reminder armed — no once flag", async () => {
    const { deps: d, created } = deps();
    const result = await createChannelRemindTool(d).execute(
      { cron: "0 7 * * 1-5", prompt: "Summarise today's calendar" },
      context(),
    );

    expect(result.ok).toBe(true);
    const input = created[0]!["input"] as Record<string, unknown>;
    expect(input["prompt"]).toBe("Summarise today's calendar");
    expect(input["__jaitJobMeta"]).not.toHaveProperty("once");
  });

  it("refuses a time that has already passed in the chat's zone", async () => {
    // 09:00 UTC is 11:00 in Vienna, so 10:00 local is behind us.
    const { deps: d, created } = deps();
    const result = await createChannelRemindTool(d).execute(
      { at: "2026-08-08T10:00", text: "too late" },
      context(),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/in the past/i);
    expect(created).toHaveLength(0);
  });

  it("reads the same stamp against the zone it was given", async () => {
    // 10:00 in Tokyo on the 8th is already past 09:00 UTC; 20:00 is not.
    const { deps: d, created } = deps();
    const remind = createChannelRemindTool(d);

    expect((await remind.execute({ at: "2026-08-08T10:00", text: "x", timeZone: "Asia/Tokyo" }, context())).ok)
      .toBe(false);
    expect((await remind.execute({ at: "2026-08-08T20:00", text: "x", timeZone: "Asia/Tokyo" }, context())).ok)
      .toBe(true);
    expect((created[0]!["input"] as Record<string, unknown>)["__jaitJobMeta"])
      .toMatchObject({ timeZone: "Asia/Tokyo" });
  });

  it("insists on knowing when and what", async () => {
    const { deps: d } = deps();
    const remind = createChannelRemindTool(d);

    expect((await remind.execute({ text: "x" }, context())).message).toMatch(/when\?/i);
    expect((await remind.execute({ at: "2026-08-09T05:00" }, context())).message).toMatch(/nothing to deliver/i);
    expect((await remind.execute({ at: "2026-08-09T05:00", cron: "* * * * *", text: "x" }, context())).message)
      .toMatch(/either .at. or .cron./i);
  });

  it("says so when the gateway has no scheduler rather than losing the reminder", async () => {
    const { deps: d } = deps({ scheduler: undefined });
    const result = await createChannelRemindTool(d).execute(
      { at: "2026-08-09T05:00", text: "x" },
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/scheduler is not available/i);
  });

  it("labels the job from the message when no name is given", async () => {
    const { deps: d, created } = deps();
    await createChannelRemindTool(d).execute(
      { at: "2026-08-09T05:00", text: "Bring the car in for its service" },
      context(),
    );
    expect(created[0]!["name"]).toBe("Bring the car in for its service");
  });
});
