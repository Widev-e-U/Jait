import type { CalendarAccount, CalendarTokens, CalendarInfo, CalendarEvent, ListCalendarEventsOptions, DeviceCalendarSnapshot } from '../../../packages/gateway/src/services/calendar/types.ts';
const account = { id: 'a', userId: null, provider: 'google', email: 'fixture@example.invalid', displayName: 'Fixture', status: 'connected', createdAt: 'created', updatedAt: 'updated' } satisfies CalendarAccount;
const tokens = { accessToken: 'synthetic', refreshToken: null, expiresAt: 1234.5 } satisfies CalendarTokens;
const calendar = { id: 'c', name: 'Calendar', description: '', timeZone: 'UTC', primary: true, selected: false, accessRole: 'reader' } satisfies CalendarInfo;
const event = { id: 'e', calendarId: 'c', calendarName: 'Calendar', title: 'Title 😀', description: '', location: '', start: '2026-10-20', end: '2026-10-21', allDay: true, status: 'confirmed', organizer: '', attendees: ['attendee@example.invalid'] } satisfies CalendarEvent;
const options = { calendarId: 'c', timeMin: '', timeMax: 'max', query: '', limit: 0.5 } satisfies ListCalendarEventsOptions;
const snapshot = { deviceId: 'd', deviceName: 'Phone', calendars: [calendar], events: [event] } satisfies DeviceCalendarSnapshot;
export const fixtures = {
  accounts: [account, { ...account, userId: 'owner', provider: 'android', status: 'error', error: null }, { ...account, error: '' }] satisfies CalendarAccount[],
  tokens: [tokens, { ...tokens, refreshToken: '', scope: '', expiresAt: -1 }] satisfies CalendarTokens[],
  calendars: [calendar, { ...calendar, primary: false, selected: true, color: '' }] satisfies CalendarInfo[],
  events: [event, { ...event, allDay: false, htmlLink: '', attendees: [] }] satisfies CalendarEvent[],
  options: [{}, options, { limit: 0 }, { limit: 100 }, { limit: -1 }, { limit: 1e21 }] satisfies ListCalendarEventsOptions[],
  snapshots: [snapshot, { ...snapshot, calendars: [], events: [] }] satisfies DeviceCalendarSnapshot[],
};
export async function dispatch(call: { op: string }) {
  if (call.op === 'nativecalendartypes.fixtures') return fixtures;
  if (call.op === 'nativecalendartypes.exports') {
    // A computed path keeps DTO-only type checking independent of service dependencies.
    const path = '../../../packages/gateway/src/services/calendar/';
    const entry = await import(`${path}index.ts`);
    const implementation = await import(`${path}service.ts`);
    const types = await import(`${path}types.ts`);
    return { exports: Object.keys(entry).sort(), serviceIdentity: entry.CalendarService === implementation.CalendarService, typesRuntimeExports: Object.keys(types) };
  }
  throw new Error('unknown calendar contract operation');
}
