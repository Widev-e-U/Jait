import { ArrowUpCircle, Loader2 as SpinnerIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { PatchNotesTooltip } from '@/components/settings/PatchNotesTooltip'
import type { ReleaseNote, UpdateInfo } from '@/components/settings/SettingsPage'

interface UpdateButtonProps {
  appPlatform: 'web' | 'desktop' | 'capacitor'
  updateInfo: UpdateInfo | null | undefined
  releases: ReleaseNote[] | null | undefined
  updateApplying: boolean
  updateAwaitingRestart: boolean
  onApplyUpdate: () => Promise<unknown>
  collapsed?: boolean
}

export function UpdateButton({ appPlatform, updateInfo, releases, updateApplying, updateAwaitingRestart, onApplyUpdate, collapsed = false }: UpdateButtonProps) {
  if (!updateInfo?.hasUpdate) return null

  const busy = (appPlatform === 'web' && (updateApplying || updateAwaitingRestart))
    || (appPlatform === 'capacitor' && updateApplying)

  const apply = async () => {
    if (appPlatform === 'desktop') {
      const desktop = window.jaitDesktop
      toast.info('Downloading update...')
      const download = await desktop?.downloadUpdate()
      if (download?.ok) {
        toast.success('Update downloaded. Restarting...')
        await desktop?.installUpdate()
      } else {
        toast.error('Download failed')
      }
    } else if (!busy) {
      await onApplyUpdate()
    }
  }

  return (
    <PatchNotesTooltip targetVersion={updateInfo.latestVersion} notes={releases} align="right">
      <Button
        onClick={() => { void apply() }}
        variant="outline"
        size="sm"
        disabled={busy || (appPlatform === 'capacitor' && !updateInfo.downloadUrl)}
        aria-label={busy ? 'Updating' : `Update to v${updateInfo.latestVersion}`}
        className={`${collapsed ? 'h-9 w-9 px-0' : 'h-8 px-2'} shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300`}
      >
        {busy ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
        {!collapsed && <span className="hidden sm:inline">{busy ? 'Updating...' : `v${updateInfo.latestVersion}`}</span>}
      </Button>
    </PatchNotesTooltip>
  )
}
