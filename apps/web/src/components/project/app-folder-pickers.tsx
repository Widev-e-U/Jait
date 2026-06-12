import { FolderPickerDialog } from '@/components/project/folder-picker-dialog'

interface AppFolderPickersProps {
  projectOpen: boolean
  onProjectOpenChange: (open: boolean) => void
  projectInitialPath?: string | null
  projectInitialNodeId?: string | null
  onProjectSelect: (path: string, nodeId: string) => void
  automationOpen: boolean
  onAutomationOpenChange: (open: boolean) => void
  onAutomationSelect: (path: string, nodeId: string) => void
}

export function AppFolderPickers({
  projectOpen,
  onProjectOpenChange,
  projectInitialPath,
  projectInitialNodeId,
  onProjectSelect,
  automationOpen,
  onAutomationOpenChange,
  onAutomationSelect,
}: AppFolderPickersProps) {
  return (
    <>
      <FolderPickerDialog
        open={projectOpen}
        onOpenChange={onProjectOpenChange}
        initialPath={projectInitialPath ?? undefined}
        initialNodeId={projectInitialNodeId ?? undefined}
        onSelect={onProjectSelect}
      />

      <FolderPickerDialog
        open={automationOpen}
        onOpenChange={onAutomationOpenChange}
        onSelect={onAutomationSelect}
      />
    </>
  )
}
