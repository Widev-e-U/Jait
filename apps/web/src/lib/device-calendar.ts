import { Capacitor, registerPlugin } from '@capacitor/core'

import type { CalendarEvent, CalendarInfo } from '@/lib/calendar-api'

export interface DeviceCalendarSnapshot {
  deviceId: string
  deviceName: string
  calendars: CalendarInfo[]
  events: CalendarEvent[]
}

interface DeviceCalendarPlugin {
  readSnapshot(options: { timeMin: number; timeMax: number }): Promise<DeviceCalendarSnapshot>
}

const DeviceCalendar = registerPlugin<DeviceCalendarPlugin>('DeviceCalendar')

export function isDeviceCalendarAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function readDeviceCalendarSnapshot(timeMin: number, timeMax: number): Promise<DeviceCalendarSnapshot> {
  return DeviceCalendar.readSnapshot({ timeMin, timeMax })
}
