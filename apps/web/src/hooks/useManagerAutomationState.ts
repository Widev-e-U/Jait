import { useEffect, useMemo, useRef } from 'react'

import { activitiesToMessages } from '@/lib/activity-to-messages'
import { getProjectRepositoryId } from '@/lib/project-repositories'
import { resolveDeveloperThreadRepoAutoSelect } from '@/lib/developer-thread-repo-selection'

interface UseManagerAutomationStateOptions {
  activeProjectId: string | null
  activeProjectRecord: unknown
  automation: any
  isMobile: boolean
  managerMessageQueues: Record<string, unknown[]>
  sendTarget: string
  viewMode: string
}

export function useManagerAutomationState({
  activeProjectId,
  activeProjectRecord,
  automation,
  isMobile,
  managerMessageQueues,
  sendTarget,
  viewMode,
}: UseManagerAutomationStateOptions) {
  const activeProjectRepositoryId = useMemo(
    () => getProjectRepositoryId(activeProjectRecord as any),
    [activeProjectRecord],
  )

  const automationMessages = useMemo(
    () => activitiesToMessages(automation.activities),
    [automation.activities],
  )
  const managerThreads = useMemo(
    () => [...automation.threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [automation.threads],
  )
  const selectedRepoRuntime = useMemo(
    () => (automation.selectedRepo ? automation.getRuntimeInfoForRepository(automation.selectedRepo) : null),
    [automation.getRuntimeInfoForRepository, automation.selectedRepo],
  )
  const selectedThreadRepo = useMemo(
    () => (automation.selectedThread ? automation.getRepositoryForThread(automation.selectedThread) : null),
    [automation.getRepositoryForThread, automation.selectedThread],
  )
  const selectedThreadRepoRuntime = useMemo(
    () => (selectedThreadRepo ? automation.getRuntimeInfoForRepository(selectedThreadRepo) : null),
    [automation.getRuntimeInfoForRepository, selectedThreadRepo],
  )
  const threadTargetRepo = automation.selectedRepo
  const threadTargetRepoRuntime = useMemo(
    () => (threadTargetRepo ? automation.getRuntimeInfoForRepository(threadTargetRepo) : null),
    [automation.getRuntimeInfoForRepository, threadTargetRepo],
  )
  const activeManagerThreads = useMemo(
    () => managerThreads.filter((thread) => thread.status === 'running'),
    [managerThreads],
  )
  const compactManagerToolbar = isMobile && viewMode === 'manager' && Boolean(automation.selectedThread)
  const selectedManagerQueue = useMemo(
    () => (automation.selectedThread ? managerMessageQueues[automation.selectedThread.id] ?? [] : []),
    [automation.selectedThread, managerMessageQueues],
  )
  const canTargetThread = threadTargetRepo != null
  const selectedRepoOffline = threadTargetRepoRuntime != null && !threadTargetRepoRuntime.online && !threadTargetRepoRuntime.loading
  const threadComposerDisabled = automation.creating || !canTargetThread || selectedRepoOffline
  const threadPlaceholder = !threadTargetRepo
    ? 'Select a repository to start a thread...'
    : selectedRepoOffline
      ? 'Repository is offline...'
      : automation.selectedThread
        ? 'Send a follow-up to the selected thread...'
        : 'Describe what you want to do...'
  const developerPlaceholder = sendTarget === 'thread'
    ? threadPlaceholder
    : sendTarget === 'swarm'
      ? 'Describe a multi-agent task...'
      : 'Ask anything...'

  const developerThreadRepoAutoSelectRef = useRef<string | null>(null)

  useEffect(() => {
    const nextSelection = resolveDeveloperThreadRepoAutoSelect({
      viewMode: viewMode as any,
      sendTarget: sendTarget as any,
      projectId: activeProjectId,
      projectRepoId: activeProjectRepositoryId,
      repositories: automation.repositories,
      lastAppliedKey: developerThreadRepoAutoSelectRef.current,
    })

    if (!nextSelection) return

    developerThreadRepoAutoSelectRef.current = nextSelection.nextAppliedKey
    if (nextSelection.repoId && automation.selectedRepoId !== nextSelection.repoId) {
      automation.setSelectedRepoId(nextSelection.repoId)
    }
  }, [
    activeProjectId,
    activeProjectRepositoryId,
    automation.repositories,
    automation.selectedRepoId,
    automation.setSelectedRepoId,
    sendTarget,
    viewMode,
  ])

  return {
    activeProjectRepositoryId,
    automationMessages,
    managerThreads,
    selectedRepoRuntime,
    selectedThreadRepo,
    selectedThreadRepoRuntime,
    threadTargetRepo,
    threadTargetRepoRuntime,
    activeManagerThreads,
    compactManagerToolbar,
    selectedManagerQueue,
    canTargetThread,
    selectedRepoOffline,
    threadComposerDisabled,
    threadPlaceholder,
    developerPlaceholder,
  }
}
