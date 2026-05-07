import { describe, expect, it } from 'vitest'
import { buildTodoThreadRequest, buildTodoThreadStartOptions, buildTodoThreadTitle } from './todo-thread'
import type { AutomationRepo, JaitTodo } from './agents-api'

const repo: AutomationRepo = {
  id: 'repo-1',
  userId: null,
  deviceId: null,
  name: 'Jait',
  defaultBranch: 'main',
  localPath: '/work/jait',
  githubUrl: null,
  forgeUrl: null,
  strategy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const todo: JaitTodo = {
  id: 'todo-1',
  repoId: repo.id,
  userId: null,
  message: 'Implement the executable todo thread action',
  status: 'open',
  priority: 'normal',
  dueDate: null,
  tags: '[]',
  completedAt: null,
  completionHistory: '[]',
  sourceThreadId: null,
  sourceThreadTitle: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('todo thread helpers', () => {
  it('uses the repo scoped generated-title placeholder', () => {
    expect(buildTodoThreadTitle('Jait')).toBe('[Jait] Generating title\u2026')
  })

  it('builds a delivery thread request for the selected repo', () => {
    expect(buildTodoThreadRequest({
      repo,
      providerId: 'codex',
      runtimeMode: 'supervised',
      model: 'gpt-5.4',
      workingDirectory: '/worktrees/jait-todo',
      branch: 'jait/abc12345',
    })).toEqual({
      title: '[Jait] Generating title\u2026',
      providerId: 'codex',
      runtimeMode: 'supervised',
      model: 'gpt-5.4',
      kind: 'delivery',
      workingDirectory: '/worktrees/jait-todo',
      branch: 'jait/abc12345',
      prBaseBranch: 'main',
    })
  })

  it('starts the thread with the todo message as the task', () => {
    expect(buildTodoThreadStartOptions(repo.name, todo)).toEqual({
      message: 'Implement the executable todo thread action',
      titleTask: 'Implement the executable todo thread action',
      titlePrefix: '[Jait] ',
    })
  })
})
