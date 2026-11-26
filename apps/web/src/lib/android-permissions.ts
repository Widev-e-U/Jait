import { Capacitor, registerPlugin } from '@capacitor/core'

export const ANDROID_PERMISSIONS = [
  { name: 'microphone', label: 'Microphone', description: 'Record voice messages and use the voice assistant.' },
  { name: 'notifications', label: 'Notifications', description: 'Receive chat updates and agent questions.' },
  { name: 'calendar', label: 'Calendar', description: 'Read events from your Android calendars.' },
  { name: 'overlay', label: 'Display over other apps', description: 'Show agent questions while you use another app.' },
  { name: 'fullScreen', label: 'Full-screen notifications', description: 'Show urgent agent questions on the lock screen.' },
  { name: 'exactAlarms', label: 'Alarms & reminders', description: 'Deliver scheduled Android alerts on time.' },
  { name: 'installUpdates', label: 'Install updates', description: 'Let Jait open the Android installer for app updates.' },
] as const

type AndroidPermissionName = typeof ANDROID_PERMISSIONS[number]['name']
type RuntimePermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
export type AndroidPermissionStates = Record<AndroidPermissionName, RuntimePermissionState | 'not-required'>

interface AndroidPermissionsPlugin {
  getDevicePermissions(): Promise<AndroidPermissionStates>
  manageDevicePermission(options: { name: AndroidPermissionName }): Promise<void>
  requestMicrophone(): Promise<{ state: RuntimePermissionState }>
  openAppSettings(): Promise<void>
}

export const AndroidPermissions = registerPlugin<AndroidPermissionsPlugin>('Permissions')

export function hasAndroidPermissions(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('Permissions')
}

export async function requestAndroidMicrophone(): Promise<boolean> {
  const { state } = await AndroidPermissions.requestMicrophone()
  if (state === 'granted') return true
  if (state === 'denied' && window.confirm('To use voice in Jait, open Android settings and choose Permissions → Microphone → Allow only while using the app.')) {
    await AndroidPermissions.openAppSettings()
  }
  return false
}
