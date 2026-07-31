export type CalendarProvider = "google" | "android";

export interface CalendarAccount {
  id: string;
  userId: string | null;
  provider: CalendarProvider;
  email: string;
  displayName: string;
  status: "connected" | "error";
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope?: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
  description: string;
  timeZone: string;
  primary: boolean;
  selected: boolean;
  accessRole: string;
  color?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
  organizer: string;
  attendees: string[];
  htmlLink?: string;
}

export interface ListCalendarEventsOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  query?: string;
  limit?: number;
}

export interface DeviceCalendarSnapshot {
  deviceId: string;
  deviceName: string;
  calendars: CalendarInfo[];
  events: CalendarEvent[];
}
