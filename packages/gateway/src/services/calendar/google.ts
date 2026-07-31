import type { CalendarEvent, CalendarInfo } from "./types.js";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const USER_INFO_API = "https://www.googleapis.com/oauth2/v2/userinfo";

interface GoogleCalendarEntry {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  hidden?: boolean;
}

interface GoogleEventEntry {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  organizer?: { email?: string; displayName?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
}

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const providerMessage = (data["error"] as { message?: string } | undefined)?.message;
    throw new Error(providerMessage || `Google Calendar request failed (${response.status})`);
  }
  return data as T;
}

export class GoogleCalendarClient {
  async getProfileEmail(accessToken: string): Promise<string> {
    const profile = await googleJson<{ email?: string }>(USER_INFO_API, accessToken);
    return profile.email ?? "";
  }

  async listCalendars(accessToken: string): Promise<CalendarInfo[]> {
    const url = new URL(`${CALENDAR_API}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    const data = await googleJson<{ items?: GoogleCalendarEntry[] }>(url.toString(), accessToken);
    return (data.items ?? [])
      .filter((calendar) => calendar.id && !calendar.hidden)
      .map((calendar) => ({
        id: calendar.id ?? "",
        name: calendar.summary || calendar.id || "Calendar",
        description: calendar.description ?? "",
        timeZone: calendar.timeZone ?? "",
        primary: calendar.primary === true,
        selected: calendar.selected !== false,
        accessRole: calendar.accessRole ?? "reader",
        color: calendar.backgroundColor,
      }));
  }

  async listEvents(
    accessToken: string,
    calendar: Pick<CalendarInfo, "id" | "name">,
    options: { timeMin: string; timeMax: string; query?: string; limit: number },
  ): Promise<CalendarEvent[]> {
    const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events`);
    url.searchParams.set("timeMin", options.timeMin);
    url.searchParams.set("timeMax", options.timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", String(options.limit));
    if (options.query?.trim()) url.searchParams.set("q", options.query.trim());

    const data = await googleJson<{ items?: GoogleEventEntry[] }>(url.toString(), accessToken);
    return (data.items ?? []).filter((event) => event.id).map((event) => ({
      id: event.id ?? "",
      calendarId: calendar.id,
      calendarName: calendar.name,
      title: event.summary || "(No title)",
      description: event.description ?? "",
      location: event.location ?? "",
      start: event.start?.dateTime ?? event.start?.date ?? "",
      end: event.end?.dateTime ?? event.end?.date ?? "",
      allDay: Boolean(event.start?.date && !event.start?.dateTime),
      status: event.status ?? "confirmed",
      organizer: event.organizer?.displayName || event.organizer?.email || "",
      attendees: (event.attendees ?? []).map((attendee) => {
        const identity = attendee.displayName || attendee.email || "Unknown attendee";
        return attendee.responseStatus ? `${identity} (${attendee.responseStatus})` : identity;
      }),
      htmlLink: event.htmlLink,
    }));
  }
}
