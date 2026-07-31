import { describe, expect, it, vi } from "vitest";
import type { MobilePushService } from "../services/mobile-push.js";
import type { ToolContext } from "./contracts.js";
import { createMobileAlarmScheduleTool } from "./mobile-tools.js";

const context: ToolContext = {
  sessionId: "daily", actionId: "alarm-action", projectRoot: "/workspace",
  requestedBy: "user", userId: "user-a",
};

describe("mobile.alarm.schedule", () => {
  it("rejects invalid or past timestamps", async () => {
    const scheduleAlarm = vi.fn();
    const tool = createMobileAlarmScheduleTool({ scheduleAlarm } as unknown as MobilePushService);
    expect(await tool.execute({ at: "yesterday" }, context)).toMatchObject({ ok: false });
    expect(scheduleAlarm).not.toHaveBeenCalled();
  });

  it("dispatches a future exact alarm to registered devices", async () => {
    const scheduleAlarm = vi.fn(async () => 1);
    const tool = createMobileAlarmScheduleTool({ scheduleAlarm } as unknown as MobilePushService);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const result = await tool.execute({ at: future, title: "Morning briefing" }, context);
    expect(result).toMatchObject({ ok: true, data: { devices: 1 } });
    expect(scheduleAlarm).toHaveBeenCalledWith("user-a", expect.objectContaining({
      id: "alarm-action", title: "Morning briefing",
    }));
  });
});
