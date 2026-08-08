import { registerPlugin } from '@capacitor/core'

/**
 * JS bridge to the native `PermissionsPlugin` (see
 * android/app/src/main/java/dev/jait/mobile/PermissionsPlugin.java).
 *
 * On Android 6.0+ the system only shows a permission dialog when the app
 * actively requests the permission at runtime — declaring it in the manifest
 * is not enough. These helpers trigger that request and report the result.
 */
interface PermissionsPlugin {
  requestMicrophone(): Promise<{ state: string }>
  requestNotifications(): Promise<{ state: string }>
}

const Permissions = registerPlugin<PermissionsPlugin>('Permissions')

/** Request mic access (RECORD_AUDIO). Resolves true if granted. */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const res = await Permissions.requestMicrophone()
    return res.state === 'granted'
  } catch {
    return false
  }
}

/** Request notification access (POST_NOTIFICATIONS). Resolves true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const res = await Permissions.requestNotifications()
    return res.state === 'granted'
  } catch {
    return false
  }
}
