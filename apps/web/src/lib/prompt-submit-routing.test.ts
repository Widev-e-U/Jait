import { describe, expect, it } from 'vitest'

import { alternateStreamingAction, resolvePromptSubmitAction, shouldQueuePromptSubmit } from './prompt-submit-routing'

describe('resolvePromptSubmitAction', () => {
  it('submits when not loading', () => {
    expect(resolvePromptSubmitAction({ isLoading: false, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true })).toBe('submit')
    expect(resolvePromptSubmitAction({ hasQueueHandler: true, hasSteerHandler: true })).toBe('submit')
  })

  it('submits for the thread target even while streaming', () => {
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'thread', hasQueueHandler: true, hasSteerHandler: true })).toBe('submit')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'thread', hasQueueHandler: true, hasSteerHandler: false })).toBe('submit')
  })

  it('steers when streaming with a steer handler and a session target', () => {
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true })).toBe('steer')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'swarm', hasQueueHandler: true, hasSteerHandler: true })).toBe('steer')
    expect(resolvePromptSubmitAction({ isLoading: true, hasQueueHandler: true, hasSteerHandler: true })).toBe('steer')
  })

  it('queues when streaming without a steer handler (legacy semantics preserved)', () => {
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: false })).toBe('queue')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true })).toBe('queue')
  })

  it('submits when streaming with neither handler', () => {
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: false, hasSteerHandler: false })).toBe('submit')
  })

  it('honors the configured default action while streaming', () => {
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true, hasThreadHandler: true, defaultAction: 'steer' })).toBe('steer')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true, hasThreadHandler: true, defaultAction: 'queue' })).toBe('queue')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true, hasThreadHandler: true, defaultAction: 'thread' })).toBe('thread')
  })

  it('falls back to steer, then queue, when the configured default has no handler', () => {
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true, defaultAction: 'thread' })).toBe('steer')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: false, defaultAction: 'thread' })).toBe('queue')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true, hasSteerHandler: true, defaultAction: 'queue' })).toBe('queue')
    expect(resolvePromptSubmitAction({ isLoading: true, sendTarget: 'agent', hasQueueHandler: false, hasSteerHandler: true, defaultAction: 'queue' })).toBe('steer')
  })
})

describe('alternateStreamingAction', () => {
  it('pairs each default with the other classic action', () => {
    expect(alternateStreamingAction('steer')).toBe('queue')
    expect(alternateStreamingAction('queue')).toBe('steer')
    expect(alternateStreamingAction('thread')).toBe('steer')
  })
})

describe('shouldQueuePromptSubmit (legacy wrapper)', () => {
  it('matches the queue semantics with steering disabled', () => {
    expect(shouldQueuePromptSubmit({ isLoading: true, sendTarget: 'agent', hasQueueHandler: true })).toBe(true)
    expect(shouldQueuePromptSubmit({ isLoading: true, sendTarget: 'swarm', hasQueueHandler: true })).toBe(true)
    expect(shouldQueuePromptSubmit({ isLoading: true, sendTarget: 'thread', hasQueueHandler: true })).toBe(false)
    expect(shouldQueuePromptSubmit({ isLoading: false, sendTarget: 'agent', hasQueueHandler: true })).toBe(false)
    expect(shouldQueuePromptSubmit({ isLoading: true, sendTarget: 'agent', hasQueueHandler: false })).toBe(false)
  })
})