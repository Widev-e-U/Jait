import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeSystemNotification,
  revokeSystemNotification,
  setNativeNotificationsEnabled,
  triggerSystemNotification,
} from './system-notifications'

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
  static live: NotificationMock[] = []

  closed = false
  readonly listeners = new Map<string, () => void>()

  constructor(title: string, options?: NotificationOptions) {
    NotificationMock.instances.push({ title, options })
    NotificationMock.live.push(this)
  }

  addEventListener(event: string, handler: () => void) {
    this.listeners.set(event, handler)
  }

  close() {
    this.closed = true
    this.listeners.get('close')?.()
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
    NotificationMock.live = []
    setNativeNotificationsEnabled(true)
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: undefined,
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the installed Android bridge when LocalNotifications is absent', async () => {
    const notify = vi.fn(async () => {})
    vi.stubGlobal('window', {
      Capacitor: { Plugins: { AgentOverlay: { notify } } },
    })
    await triggerSystemNotification({ id: 'chat-complete:session:1', title: 'Chat finished', body: 'Done' })
    expect(notify).toHaveBeenCalledWith({ id: 'chat-complete:session:1', title: 'Chat finished', body: 'Done' })
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

    expect(notify).toHaveBeenCalledWith({ id: 'notif-4', title: 'Build failed', body: 'Retry the preview' })
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

  it('drops to an in-app toast when another surface owns the system notification', async () => {
    NotificationMock.permission = 'granted'
    setNativeNotificationsEnabled(false)

    await triggerSystemNotification({
      id: 'notif-6',
      title: 'Approval needed',
      body: 'terminal.run wants to run',
    })

    expect(NotificationMock.instances).toEqual([])
    expect(toastInfo).toHaveBeenCalledWith('Approval needed', { description: 'terminal.run wants to run' })
  })

  it('closes the browser notification when the request is answered elsewhere', async () => {
    NotificationMock.permission = 'granted'

    await triggerSystemNotification({ id: 'consent:req-1', title: 'Approval needed', body: 'Allow?' })
    await revokeSystemNotification('consent:req-1')

    expect(NotificationMock.live.map((instance) => instance.closed)).toEqual([true])
    // Revoking twice is normal (timeout racing an answer) and must stay quiet.
    await expect(revokeSystemNotification('consent:req-1')).resolves.toBeUndefined()
  })

  it('asks the desktop shell to dismiss its keyed notification', async () => {
    const closeNotification = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: { notify: vi.fn(async () => {}), closeNotification },
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)

    await revokeSystemNotification('question:req-9')

    expect(closeNotification).toHaveBeenCalledWith('question:req-9')
  })
})
