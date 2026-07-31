import type { CalendarService } from "../services/calendar/index.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

function userId(context: ToolContext): string | null {
  return context.userId ?? null;
}

interface CalendarListInput {
  accountId?: string;
}

export function createCalendarListTool(calendar: CalendarService): ToolDefinition<CalendarListInput> {
  return {
    name: "calendar_list",
    description:
      "List the calendars available through the user's connected Google Calendar account. This includes calendars shown in Samsung Calendar when Samsung Calendar syncs that Google account.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Connected calendar account id. Omit for the default account." },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        const { account, calendars } = await calendar.listCalendars(userId(context), input?.accountId);
        return {
          ok: true,
          message: `${calendars.length} calendar(s) from ${account.email}.`,
          data: { account: { id: account.id, email: account.email, provider: account.provider }, calendars },
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Failed to list calendars" };
      }
    },
  };
}

interface CalendarEventsInput {
  accountId?: string;
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  query?: string;
  limit?: number;
}

export function createCalendarEventsTool(calendar: CalendarService): ToolDefinition<CalendarEventsInput> {
  return {
    name: "calendar_events",
    description:
      "Read upcoming or matching events from the user's connected calendars. Defaults to the next 7 days across selected calendars. Use this before alarms, wake-up prompts, planning, or any job that should account for work, appointments, travel, birthdays, or other important events.",
    tier: "standard",
    category: "web",
    source: "builtin",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Connected calendar account id. Omit for the default account." },
        calendarId: { type: "string", description: "Specific calendar id. Omit to search all selected calendars." },
        timeMin: { type: "string", description: "Inclusive ISO 8601 start. Defaults to now." },
        timeMax: { type: "string", description: "Exclusive ISO 8601 end. Defaults to 7 days from now." },
        query: { type: "string", description: "Optional text search across event title, description, location, and attendees." },
        limit: { type: "number", description: "Maximum events to return (1-250, default 50)." },
      },
    },
    async execute(input, context): Promise<ToolResult> {
      try {
        const { account, events } = await calendar.listEvents(userId(context), input?.accountId, {
          calendarId: input?.calendarId,
          timeMin: input?.timeMin,
          timeMax: input?.timeMax,
          query: input?.query,
          limit: input?.limit,
        });
        return {
          ok: true,
          message: `${events.length} event(s) from ${account.email}.`,
          data: { account: { id: account.id, email: account.email, provider: account.provider }, events },
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Failed to list calendar events" };
      }
    },
  };
}

export function createCalendarTools(calendar: CalendarService): ToolDefinition[] {
  return [createCalendarListTool(calendar), createCalendarEventsTool(calendar)] as ToolDefinition[];
}
