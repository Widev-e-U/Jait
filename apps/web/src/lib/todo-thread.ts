import type { AutomationRepo, CreateThreadRequest, JaitTodo, ProviderId, RuntimeMode, StartThreadOptions } from '@/lib/agents-api'

export function buildTodoThreadTitle(repoName: string): string {
  return `[${repoName}] Generating title\u2026`
}

export function buildTodoThreadRequest({
  repo,
  providerId,
  runtimeMode,
  model,
  workingDirectory,
  branch,
}: {
  repo: AutomationRepo
  providerId: ProviderId
  runtimeMode: RuntimeMode
  model?: string | null
  workingDirectory: string
  branch: string
}): CreateThreadRequest {
  return {
    title: buildTodoThreadTitle(repo.name),
    providerId,
    runtimeMode,
    ...(model ? { model } : {}),
    kind: 'delivery',
    workingDirectory,
    branch,
    prBaseBranch: repo.defaultBranch,
  }
}

export function buildTodoThreadStartOptions(repoName: string, todo: Pick<JaitTodo, 'message'>): StartThreadOptions {
  return {
    message: todo.message,
    titleTask: todo.message,
    titlePrefix: `[${repoName}] `,
  }
}
