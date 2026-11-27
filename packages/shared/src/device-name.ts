export const DEVICE_NAME_MAX_LENGTH = 64;

export function normalizeDeviceName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function deviceNameKey(value: string): string {
  return normalizeDeviceName(value).toLowerCase();
}

export function isAllowedDeviceName(name: string): boolean {
  const key = deviceNameKey(name);
  return key.length > 0 && name.length <= DEVICE_NAME_MAX_LENGTH
    && !/\p{C}/u.test(name)
    && key !== 'gateway' && key !== 'mobile'
    && !/^desktop \((?:win32|win64|windows|macintel|macppc|mac68k|macos|darwin|linux(?: [^)]+)?|x11)?\)$/u.test(key);
}

export type DeviceRegistrationResult =
  | { id: string; name: string; ok: true }
  | { id: string; name: string; ok: false; code: 'INVALID_DEVICE_NAME' | 'DEVICE_NAME_TAKEN' | 'DEVICE_REGISTRATION_FAILED' };
