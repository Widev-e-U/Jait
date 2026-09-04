import { ErrorBoundary } from '@/components/error-boundary'
import { EmailPage } from '@/components/email'
import { CalendarPage } from '@/components/calendar'
import { JobsPage } from '@/components/jobs'
import { MemoryPage } from '@/components/reminders'
import { NetworkPanel } from '@/components/network'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { TodoPage } from '@/components/todo'
import { PullRequestsPage } from '@/components/pull-requests'
import type { ActivityEvent } from '@jait/ui-shared'
import type { ChatStreamingAction, JaitBackend, SttProvider } from '@/hooks/useAuth'
import type { AppView } from '@/lib/app-view'
import type { ProviderId, RuntimeMode } from '@/lib/agents-api'
import type { AutomationRepository } from '@/lib/automation-repositories'

interface AppPageOutletProps {
  activeSessionId: string | null
  activityEvents: ActivityEvent[]
  apiKeys: Record<string, string>
  appPlatform: 'web' | 'electron' | 'capacitor'
  chatProvider: ProviderId
  chatProviderRuntimeMode: RuntimeMode
  cliModel: string | null
  currentView: AppView
  isMobile: boolean
  repositories: AutomationRepository[]
  jaitBackend: JaitBackend
  sttProvider: SttProvider
  token: string | null
  updateApplying: boolean
  updateChecking: boolean
  updateInfo: any
  releases: any
  releasesLoading: boolean
  username: string
  onApplyUpdate: () => void
  onCheckUpdate: () => void
  onCheckChangelog: () => void
  onClearArchive: () => Promise<number>
  onClearArchivedProjects: () => Promise<number>
  onFetchArchivedProjects: () => Promise<any>
  chatStreamingAction: ChatStreamingAction
  onJaitBackendChange: (next: JaitBackend) => Promise<void>
  onRestoreProject: (projectId: string) => Promise<boolean>
  onSaveApiKeys: (apiKeys: Record<string, string>) => Promise<void>
  onSttProviderChange: (next: SttProvider) => Promise<void>
  onChatStreamingActionChange: (next: ChatStreamingAction) => Promise<void>
  onVoiceInput: () => void
  onVoiceStop: () => void
  voiceLevels: number[]
  voiceRecording: boolean
  voiceTranscribing: boolean
}

function PageFrame({ children, isMobile }: { children: React.ReactNode; isMobile: boolean }) {
  return <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-12' : ''}`}>{children}</div>
}

export function AppPageOutlet({
  activeSessionId,
  activityEvents,
  apiKeys,
  appPlatform,
  chatProvider,
  chatProviderRuntimeMode,
  cliModel,
  currentView,
  isMobile,
  repositories,
  jaitBackend,
  chatStreamingAction,
  sttProvider,
  token,
  updateApplying,
  updateChecking,
  updateInfo,
  releases,
  releasesLoading,
  username,
  onApplyUpdate,
  onCheckUpdate,
  onCheckChangelog,
  onClearArchive,
  onClearArchivedProjects,
  onFetchArchivedProjects,
  onJaitBackendChange,
  onRestoreProject,
  onSaveApiKeys,
  onSttProviderChange,
  onChatStreamingActionChange,
  onVoiceInput,
  onVoiceStop,
  voiceLevels,
  voiceRecording,
  voiceTranscribing,
}: AppPageOutletProps) {
  if (currentView === 'pulls') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Pull Requests" variant="section" className="h-full" resetKeys={[currentView, token, repositories.length]}>
          <PullRequestsPage repositories={repositories} />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView === 'todo') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Todo" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
          <TodoPage
            provider={chatProvider}
            model={cliModel}
            runtimeMode={chatProvider !== 'jait' ? chatProviderRuntimeMode : 'full-access'}
            onVoiceInput={onVoiceInput}
            voiceRecording={voiceRecording}
            voiceTranscribing={voiceTranscribing}
            voiceLevels={voiceLevels}
            onVoiceStop={onVoiceStop}
          />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView === 'email') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Email" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
          <EmailPage isMobile={isMobile} />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView === 'calendar') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Calendar" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
          <CalendarPage />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView === 'memory') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Memory" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
          <MemoryPage />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView === 'jobs') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Jobs" variant="section" className="min-h-full" resetKeys={[currentView]}>
          <JobsPage />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView === 'network') {
    return (
      <PageFrame isMobile={isMobile}>
        <ErrorBoundary name="Network" variant="section" className="min-h-full" resetKeys={[currentView, token, activeSessionId]}>
          <NetworkPanel token={token} sessionId={activeSessionId ?? 'default'} />
        </ErrorBoundary>
      </PageFrame>
    )
  }

  if (currentView !== 'settings') return null

  return (
    <PageFrame isMobile={isMobile}>
      <ErrorBoundary name="Settings" variant="section" className="min-h-full" resetKeys={[currentView, token]}>
        <SettingsPage
          username={username}
          token={token}
          apiKeys={apiKeys}
          onSaveApiKeys={onSaveApiKeys}
          sttProvider={sttProvider}
          onSttProviderChange={onSttProviderChange}
          chatStreamingAction={chatStreamingAction}
          onChatStreamingActionChange={onChatStreamingActionChange}
          jaitBackend={jaitBackend}
          onJaitBackendChange={onJaitBackendChange}
          onClearArchive={onClearArchive}
          onClearArchivedProjects={onClearArchivedProjects}
          onFetchArchivedProjects={onFetchArchivedProjects}
          onRestoreProject={onRestoreProject}
          activityEvents={activityEvents}
          updateInfo={updateInfo}
          updateChecking={updateChecking}
          onCheckUpdate={onCheckUpdate}
          onApplyUpdate={onApplyUpdate}
          updateApplying={updateApplying}
          releases={releases}
          releasesLoading={releasesLoading}
          onCheckChangelog={onCheckChangelog}
          platform={appPlatform}
        />
      </ErrorBoundary>
    </PageFrame>
  )
}
