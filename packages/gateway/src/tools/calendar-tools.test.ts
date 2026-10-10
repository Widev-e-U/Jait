import { describe, expect, it, vi } from "vitest";
import type { CalendarService } from "../services/calendar/index.js";
import { createCalendarTools } from "./calendar-tools.js";
const context = { sessionId: "calendar-tests", actionId: "calendar-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "google", refreshToken: "must-not-leak" };
const cases = [
  { name: "calendar_list", method: "listCalendars", input: { accountId: "account-1" }, args: ["owner-1", "account-1"],
    output: { account, calendars: [{ name: "Work", primary: true, selected: true, timeZone: "UTC" }] }, key: "calendars" },
  { name: "calendar_events", method: "listEvents", input: { accountId: "account-1", calendarId: "work", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { calendarId: "work", query: "maintenance", limit: 5, timeMin: undefined, timeMax: undefined }],
    output: { account, events: [{ title: "Maintenance", start: "2026-10-09T08:00:00Z", calendarName: "Work" }] }, key: "events" },
];
describe.each(cases)("$name", ({ name, method, input, args, output, key }) => {
  it("passes account ownership and filters and omits account credentials", async () => {
    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const tool = createCalendarTools(service as unknown as CalendarService).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    expect(service[method]).toHaveBeenCalledWith(...args);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ account: { id: account.id, email: account.email, provider: account.provider }, [key]: output[key as keyof typeof output] });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });
  it("reports a disconnected account rather than an empty successful result", async () => {
    const service = { [method]: vi.fn().mockRejectedValue(new Error("Calendar account disconnected")) };
    const tool = createCalendarTools(service as unknown as CalendarService).find((tool) => tool.name === name)!;
    expect(await tool.execute(input, context)).toEqual({ ok: false, message: "Calendar account disconnected" });
  });
});
