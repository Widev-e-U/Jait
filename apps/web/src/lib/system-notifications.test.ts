import { describe, expect, it } from 'vitest'
import { normalizeSystemNotification } from './system-notifications'

describe('normalizeSystemNotification', () => {
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
})
