import { describe, expect, it } from "vitest";
import {
  CHANNEL_ACTIVATED_TOOLS,
  CHANNEL_ASSISTANT_NOTE,
  buildChannelContextBlock,
  formatLocalTime,
  hostTimeZone,
} from "./assistant.js";
import { ToolName } from "../tools/tool-names.js";

describe("activated tools", () => {
  it("names tools that actually exist", () => {
    // A typo here fails silently: the name resolves to nothing and the tool is
    // simply absent from the request, which looks like the model refusing.
    const known = new Set<string>(Object.values(ToolName));
    for (const name of CHANNEL_ACTIVATED_TOOLS) {
      expect(known, `${name} is not a registered tool name`).toContain(name);
    }
  });

  it("covers what the assistant is told to do unprompted", () => {
    expect(CHANNEL_ACTIVATED_TOOLS).toContain(ToolName.MemorySearch);
    expect(CHANNEL_ACTIVATED_TOOLS).toContain(ToolName.ChannelRemind);
    expect(CHANNEL_ACTIVATED_TOOLS).toContain(ToolName.SkillsManage);
  });
});

describe("channel context block", () => {
  const ctx = {
    channelId: "telegram",
    channelLabel: "Telegram",
    conversationId: "4242",
    model: "claude-sonnet-5",
    timeZone: "Europe/Vienna",
    now: new Date("2026-08-08T09:00:00Z"),
  };

  it("carries the chat address the model cannot guess", () => {
    const block = buildChannelContextBlock(ctx);
    expect(block).toContain("channel: Telegram (id: telegram)");
    expect(block).toContain("conversationId: 4242");
  });

  it("states the local time, since a reminder is set against it", () => {
    const block = buildChannelContextBlock(ctx);
    // 09:00 UTC is 11:00 in Vienna.
    expect(block).toContain("11:00");
    expect(block).toContain("Europe/Vienna");
    expect(block).toContain("2026-08-08T09:00:00.000Z");
  });

  it("says which model is answering, or that none was picked", () => {
    expect(buildChannelContextBlock(ctx)).toContain("model: claude-sonnet-5");
    expect(buildChannelContextBlock({ ...ctx, model: undefined })).toContain("model: gateway default");
  });
});

describe("local time formatting", () => {
  it("renders an unambiguous 24-hour stamp", () => {
    const text = formatLocalTime(new Date("2026-08-08T09:00:00Z"), "Europe/Vienna");
    expect(text).toContain("11:00");
    expect(text).toContain("2026");
  });

  it("falls back to ISO rather than throwing on a bad zone", () => {
    expect(formatLocalTime(new Date("2026-08-08T09:00:00Z"), "Not/AZone"))
      .toBe("2026-08-08T09:00:00.000Z");
  });

  it("resolves a host zone", () => {
    expect(hostTimeZone()).toMatch(/^[A-Za-z]+(\/[A-Za-z_+-]+)*$/);
  });
});

describe("the assistant's standing instructions", () => {
  it("tells it to search memory before claiming it lacks context", () => {
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/memory\.search/);
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/session\.search/);
  });

  it("tells it how to schedule one-offs and routines", () => {
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/channel\.remind/);
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/once: true/);
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/localTime/);
  });

  it("tells it to write its own skills", () => {
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/skills\.manage/);
    expect(CHANNEL_ASSISTANT_NOTE).toMatch(/without waiting to be asked/);
  });
});
