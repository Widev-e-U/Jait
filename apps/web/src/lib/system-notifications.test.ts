import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeSystemNotification, triggerSystemNotification } from './system-notifications'

const {
  toastInfo,
  toastSuccess,
  toastWarning,
  toastError,
} = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    info: toastInfo,
    success: toastSuccess,
    warning: toastWarning,
    error: toastError,
  },
}))

class NotificationMock {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async () => 'granted' as const)
  static instances: Array<{ title: string; options?: NotificationOptions }> = []

  constructor(title: string, options?: NotificationOptions) {
    NotificationMock.instances.push({ title, options })
  }
}

describe('normalizeSystemNotification', () => {
  beforeEach(() => {
    toastInfo.mockReset()
    toastSuccess.mockReset()
    toastWarning.mockReset()
    toastError.mockReset()
    NotificationMock.permission = 'default'
    NotificationMock.requestPermission.mockReset()
    NotificationMock.requestPermission.mockResolvedValue('granted')
    NotificationMock.instances = []
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: undefined,
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops notifications with no visible title or body', () => {
    expect(normalizeSystemNotification({
      id: 'notif-1',
      title: '   ',
      body: '  ',
      level: 'error',
    })).toBeNull()
  })

  it('trims visible notification content', () => {
    expect(normalizeSystemNotification({
      id: 'notif-2',
      title: ' Restart failed ',
      body: ' Try again ',
      level: 'error',
    })).toEqual({
      id: 'notif-2',
      title: 'Restart failed',
      body: 'Try again',
      level: 'error',
    })
  })

  it('promotes body to title when title is blank', () => {
    expect(normalizeSystemNotification({
      id: 'notif-3',
      title: '   ',
      body: ' Restart failed ',
      level: 'error',
    })).toEqual({
      id: 'notif-3',
      title: 'Restart failed',
      body: '',
      level: 'error',
    })
  })

  it('keeps showing the toast when the desktop notify bridge rejects', async () => {
    const notify = vi.fn(async () => {
      throw new Error('bridge offline')
    })
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: { notify },
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)

    await expect(triggerSystemNotification({
      id: 'notif-4',
      title: 'Build failed',
      body: 'Retry the preview',
    })).resolves.toBeUndefined()

    expect(notify).toHaveBeenCalledWith({ title: 'Build failed', body: 'Retry the preview' })
    expect(NotificationMock.requestPermission).toHaveBeenCalledTimes(1)
    expect(NotificationMock.instances).toEqual([
      {
        title: 'Build failed',
        options: { body: 'Retry the preview', tag: 'notif-4', icon: '/apple-touch-icon.png', badge: '/favicon-32x32.png' },
      },
    ])
    expect(toastInfo).toHaveBeenCalledWith('Build failed', { description: 'Retry the preview' })
  })

  it('opens a browser notification immediately when permission is already granted', async () => {
    NotificationMock.permission = 'granted'

    await triggerSystemNotification({
      id: 'notif-5',
      title: 'Agent finished',
      body: 'All checks passed',
      level: 'success',
    })

    expect(NotificationMock.requestPermission).not.toHaveBeenCalled()
    expect(NotificationMock.instances).toEqual([
      {
        title: 'Agent finished',
        options: { body: 'All checks passed', tag: 'notif-5', icon: '/apple-touch-icon.png', badge: '/favicon-32x32.png' },
      },
    ])
    expect(toastSuccess).toHaveBeenCalledWith('Agent finished', { description: 'All checks passed' })
  })
})
