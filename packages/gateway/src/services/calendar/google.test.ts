import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarClient } from "./google.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleCalendarClient", () => {
  it("normalizes visible calendars and ignores hidden calendars", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          id: "primary@example.com",
          summary: "Personal",
          primary: true,
          selected: true,
          accessRole: "owner",
          timeZone: "Europe/Berlin",
          backgroundColor: "#00aaff",
        },
        { id: "hidden", summary: "Hidden", hidden: true },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const calendars = await new GoogleCalendarClient().listCalendars("access-token");

    expect(calendars).toEqual([expect.objectContaining({
      id: "primary@example.com",
      name: "Personal",
      primary: true,
      selected: true,
      timeZone: "Europe/Berlin",
    })]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("calendarList"),
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it("normalizes timed and all-day events and forwards search bounds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          id: "timed",
          summary: "Early shift",
          location: "Office",
          start: { dateTime: "2026-08-01T06:00:00+02:00" },
          end: { dateTime: "2026-08-01T14:00:00+02:00" },
          organizer: { email: "boss@example.com" },
          attendees: [{ email: "me@example.com", responseStatus: "accepted" }],
        },
        {
          id: "birthday",
          summary: "Birthday",
          start: { date: "2026-08-02" },
          end: { date: "2026-08-03" },
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const events = await new GoogleCalendarClient().listEvents(
      "access-token",
      { id: "primary@example.com", name: "Personal" },
      {
        timeMin: "2026-08-01T00:00:00.000Z",
        timeMax: "2026-08-08T00:00:00.000Z",
        query: "shift",
        limit: 20,
      },
    );

    expect(events).toEqual([
      expect.objectContaining({ id: "timed", title: "Early shift", allDay: false, calendarName: "Personal" }),
      expect.objectContaining({ id: "birthday", title: "Birthday", allDay: true, start: "2026-08-02" }),
    ]);
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("q")).toBe("shift");
    expect(requestUrl.searchParams.get("singleEvents")).toBe("true");
    expect(requestUrl.searchParams.get("orderBy")).toBe("startTime");
    expect(requestUrl.searchParams.get("maxResults")).toBe("20");
  });

  it("surfaces Google API error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Calendar API is disabled" },
    }), { status: 403, headers: { "Content-Type": "application/json" } })));

    await expect(new GoogleCalendarClient().listCalendars("bad-token"))
      .rejects.toThrow("Calendar API is disabled");
  });
});
