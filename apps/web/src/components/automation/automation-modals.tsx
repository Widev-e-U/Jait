import { PlanModal } from '@/components/automation/PlanModal'
import { StrategyModal } from '@/components/automation/StrategyModal'
import type { AutomationRepository } from '@/lib/automation-repositories'
import { agentsApi, type AutomationPlan, type PlanTask, type ProviderId, type RuntimeMode } from '@/lib/agents-api'
import { gitApi } from '@/lib/git-api'

interface AutomationModalsProps {
  strategyRepo: AutomationRepository | null
  onStrategyRepoChange: (repo: AutomationRepository | null) => void
  planRepo: AutomationRepository | null
  onPlanRepoChange: (repo: AutomationRepository | null) => void
  provider: ProviderId
  runtimeMode: RuntimeMode
  model?: string | null
}

export function AutomationModals({
  strategyRepo,
  onStrategyRepoChange,
  planRepo,
  onPlanRepoChange,
  provider,
  runtimeMode,
  model,
}: AutomationModalsProps) {
  const handleStartPlanThread = (task: PlanTask, plan: AutomationPlan) => {
    void (async () => {
      const repo = planRepo!
      const branchName = `jait/${Math.random().toString(16).slice(2, 10)}`
      const baseBranch = repo.defaultBranch
      let worktreePath: string | undefined

      try {
        const wt = await gitApi.createWorktree(repo.localPath, baseBranch, branchName)
        worktreePath = wt.path
      } catch {
        try { await gitApi.createBranch(repo.localPath, branchName, baseBranch) } catch { /* ignore */ }
      }

      const thread = await agentsApi.createThread({
        title: `[${repo.name}] ${task.title}`,
        providerId: provider,
        runtimeMode: provider !== 'jait' ? runtimeMode : undefined,
        kind: 'delivery',
        workingDirectory: worktreePath ?? repo.localPath,
        branch: branchName,
        prBaseBranch: baseBranch,
      })

      await agentsApi.startThread(thread.id, {
        message: task.description || task.title,
        titleTask: task.title,
        titlePrefix: `[${repo.name}] `,
      })

      const updatedTasks = plan.tasks.map((planTask: any) =>
        planTask.id === task.id ? { ...planTask, status: 'running' as const, threadId: thread.id } : planTask
      )
      await agentsApi.updatePlan(plan.id, { tasks: updatedTasks })
    })()
  }

  return (
    <>
      {strategyRepo && (
        <StrategyModal
          open={!!strategyRepo}
          onOpenChange={(open) => {
            if (!open) {
              onStrategyRepoChange(null)
            }
          }}
          repoId={strategyRepo.id}
          repoName={strategyRepo.name}
        />
      )}

      {planRepo && (
        <PlanModal
          open={!!planRepo}
          onOpenChange={(open) => {
            if (!open) {
              onPlanRepoChange(null)
            }
          }}
          repoId={planRepo.id}
          repoName={planRepo.name}
          defaultBranch={planRepo.defaultBranch}
          repoLocalPath={planRepo.localPath}
          provider={provider}
          model={model}
          onStartThread={handleStartPlanThread}
        />
      )}
    </>
  )
}
