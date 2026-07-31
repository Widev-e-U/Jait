import type { MobilePushService } from "../services/mobile-push.js";
import type { ToolDefinition } from "./contracts.js";

interface MobileAlarmInput {
  at: string;
  title?: string;
  body?: string;
  id?: string;
}

export function createMobileAlarmScheduleTool(mobilePush: MobilePushService): ToolDefinition<MobileAlarmInput> {
  return {
    name: "mobile.alarm.schedule",
    displayName: "Schedule phone alarm",
    description: "Schedule an exact wake-up alarm on the authenticated users registered Android phone. Use an ISO-8601 timestamp with timezone.",
    tier: "standard",
    category: "os",
    risk: "medium",
    defaultConsentLevel: "once",
    parameters: {
      type: "object",
      properties: {
        at: { type: "string", description: "Future ISO-8601 timestamp including timezone offset." },
        title: { type: "string", description: "Alarm title." },
        body: { type: "string", description: "Alarm message." },
        id: { type: "string", description: "Stable alarm identifier for replacement." },
      },
      required: ["at"],
    },
    execute: async (input, context) => {
      if (!context.userId) return { ok: false, message: "A signed-in user is required" };
      const at = Date.parse(input.at);
      if (!Number.isFinite(at) || at <= Date.now()) return { ok: false, message: "at must be a future ISO-8601 timestamp" };
      const delivered = await mobilePush.scheduleAlarm(context.userId, {
        id: input.id?.trim() || context.actionId,
        at,
        title: input.title?.trim() || "Jait wake-up alarm",
        body: input.body?.trim() || "Good morning. Open Jait for your daily briefing.",
      });
      return delivered > 0
        ? { ok: true, message: "Alarm sent to " + delivered + " Android device(s)", data: { at: new Date(at).toISOString(), devices: delivered } }
        : { ok: false, message: "No configured Android push device is available" };
    },
  };
}
