/**
 * Edit a folder/project: name, description, colour, and the extra context
 * injected into every chat inside it.
 *
 * Instructions inherited from parent folders are shown read-only above the
 * editable field, because what actually reaches the model is the whole chain —
 * editing only the leaf without seeing the rest is how people write
 * contradictory context.
 */
import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, GitBranch, Info, X } from 'lucide-react'
import { MAX_INSTRUCTION_CHARS } from '@jait/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ProjectColorPicker } from '@/components/project/project-color-picker'
import { FolderPickerDialog } from '@/components/project/folder-picker-dialog'
import { getProjectRepository, getProjectRepositoryId } from '@/lib/project-repositories'
import type { AutomationRepository } from '@/lib/automation-repositories'
import type { ProjectRecord } from '@/hooks/useProjects'

export interface ProjectContextDraft {
  title: string
  description: string | null
  color: string | null
  instructions: string | null
  /** Working directory; null makes (or keeps) this a pure grouping folder. */
  rootPath: string | null
  nodeId: string | null
  /**
   * Repository chosen explicitly. The gateway attaches this one even when the
   * row has no directory of its own, which is what lets a folder created empty
   * be given a repository afterwards.
   */
  repoId: string | null
}

/** Sentinel option that opens the folder picker instead of selecting a value. */
const BROWSE_OPTION = '__browse__'
/** Sentinel for a directory that is not one of the known repositories. */
const CUSTOM_OPTION = '__custom__'

/**
 * Last segment of a path, for either separator — a folder picked on a Windows
 * node comes back with backslashes. Empty when there is nothing to take.
 */
export function projectNameFromPath(path: string | null | undefined): string {
  if (!path) return ''
  const segments = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return segments[segments.length - 1] ?? ''
}

interface ProjectContextDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row being edited; null while creating, when nothing exists yet. */
  project: ProjectRecord | null
  /**
   * In 'create' mode nothing is written until Save, so Cancel leaves no trace.
   * The caller owns the parent id and does the actual create.
   */
  mode?: 'edit' | 'create'
  /** Root-first ancestors, used for the inherited-context preview. */
  ancestors: ProjectRecord[]
  /** Known repositories, offered as working directories. */
  repositories?: AutomationRepository[]
  /** Return false to keep the dialog open — the draft survives a failed save. */
  onSave: (draft: ProjectContextDraft) => Promise<boolean> | boolean
}

export function ProjectContextDialog({
  open,
  onOpenChange,
  project,
  mode = 'edit',
  ancestors,
  repositories = [],
  onSave,
}: ProjectContextDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [repoId, setRepoId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Re-seed whenever a different project is opened, so the dialog never shows
  // the previous folder's text. Creating starts blank for the same reason.
  useEffect(() => {
    if (!open) return
    if (mode === 'create') {
      setTitle('')
      setDescription('')
      setColor(null)
      setInstructions('')
      setRootPath(null)
      setNodeId(null)
      setRepoId(null)
      return
    }
    if (!project) return
    setTitle(project.title ?? '')
    setDescription(project.description ?? '')
    setColor(project.color)
    setInstructions(project.instructions ?? '')
    setRootPath(project.rootPath)
    setNodeId(project.nodeId)
    setRepoId(getProjectRepositoryId(project))
  }, [open, project, mode])

  /**
   * The repository the current selection stands for. A path the user browsed to
   * still resolves to a known repository when it is the same directory, so the
   * two ways of picking the same thing don't become two different states.
   */
  const selectedRepository = useMemo(() => (
    repositories.find((repo) => repo.id === repoId)
      ?? (rootPath ? repositories.find((repo) => repo.localPath === rootPath) : undefined)
      ?? null
  ), [repoId, repositories, rootPath])

  const sourceValue = selectedRepository?.id ?? (rootPath ? CUSTOM_OPTION : '')

  /**
   * Name the row gets when the user leaves the field blank. Picking a folder is
   * already a statement of what this is called, so typing the same word again
   * is busywork — the repository's name, or the folder's own name, stands in.
   */
  const derivedName = selectedRepository?.name?.trim() || projectNameFromPath(rootPath)

  const handleSourceChange = (value: string) => {
    if (value === BROWSE_OPTION) {
      setPickerOpen(true)
      return
    }
    // Re-picking the custom entry that is already selected is a no-op rather
    // than a way to accidentally clear the directory.
    if (value === CUSTOM_OPTION) return
    if (!value) {
      setRepoId(null)
      setRootPath(null)
      setNodeId(null)
      return
    }
    const repo = repositories.find((entry) => entry.id === value)
    if (!repo) return
    // A repository *is* a directory, so selecting one fills in the working
    // directory too — otherwise the row would have a repo it cannot run in.
    setRepoId(repo.id)
    setRootPath(repo.localPath)
    setNodeId(repo.deviceId ?? 'gateway')
  }

  const inherited = useMemo(
    () => ancestors.filter((a) => a.instructions?.trim()),
    [ancestors],
  )

  /**
   * Nearest ancestor that owns a directory. Shown when this row has none, so
   * the user can see where its chats would actually run instead of assuming
   * "no directory" means "nowhere". `ancestors` is root-first.
   */
  const inheritedRoot = useMemo(
    () => (rootPath ? null : [...ancestors].reverse().find((a) => a.rootPath?.trim()) ?? null),
    [ancestors, rootPath],
  )

  /** Repository already attached to the saved row, for the detach warning. */
  const existingRepository = project ? getProjectRepository(project, repositories) : null

  const overBudget = instructions.length > MAX_INSTRUCTION_CHARS
  const isCreate = mode === 'create'
  // "Folder" is not a separate thing to create — it is simply what a row is
  // called while it has no directory. The label follows the field live.
  const isFolder = !rootPath

  const handleSave = async () => {
    if (overBudget || (!isCreate && !project)) return
    setSaving(true)
    try {
      const ok = await onSave({
        title: title.trim() || derivedName || (isFolder ? 'New folder' : 'Untitled Project'),
        description: description.trim() || null,
        color,
        instructions: instructions.trim() || null,
        rootPath,
        nodeId,
        repoId: selectedRepository?.id ?? null,
      })
      if (ok) onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'New project or folder' : isFolder ? 'Folder settings' : 'Project settings'}
          </DialogTitle>
          <DialogDescription>
            A row without a repository just groups chats. Give it one now or any
            time later — an existing repository, or any folder on disk.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pl-1 pr-3">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-title">Name</Label>
              <Input
                id="project-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={derivedName || (isFolder ? 'e.g. Work' : 'Project name')}
              />
              {derivedName && !title.trim() && (
                <p className="text-2xs text-muted-foreground">
                  Leave blank to use the folder name <span className="font-medium">{derivedName}</span>.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Input
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this is for — shown in the sidebar and searchable"
              />
            </div>

            {/*
              One field, not two. "Working directory" and "repository" were the
              same setting under two names: a repository is a directory that
              contains .git. Picking either fills in the other, and leaving it
              empty is what makes this a plain grouping folder — which can be
              given a repository later without being recreated.
            */}
            <div className="space-y-1.5">
              <Label htmlFor="project-source">
                Repository or folder <span className="text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex items-center gap-2">
                <select
                  id="project-source"
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={sourceValue}
                  onChange={(e) => handleSourceChange(e.target.value)}
                >
                  <option value="">No repository or folder</option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>{repo.name}</option>
                  ))}
                  {sourceValue === CUSTOM_OPTION && rootPath && (
                    <option value={CUSTOM_OPTION}>{rootPath}</option>
                  )}
                  <option value={BROWSE_OPTION}>Browse for a folder…</option>
                </select>
                {/* Same picker as the "Browse" option — a folder button is what
                    people reach for first, so it sits where they look. */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Browse for a folder"
                  title="Browse for a folder"
                  onClick={() => setPickerOpen(true)}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
                {rootPath && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove repository or folder"
                    onClick={() => { setRootPath(null); setNodeId(null); setRepoId(null) }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {rootPath && (
                <p className="truncate font-mono text-2xs text-muted-foreground" title={rootPath}>
                  {rootPath}
                </p>
              )}
              {inheritedRoot && (
                <p className="text-2xs text-muted-foreground">
                  Chats here run in <span className="font-mono">{inheritedRoot.rootPath}</span>,
                  inherited from {inheritedRoot.title || 'a parent folder'}.
                </p>
              )}
              {existingRepository && !selectedRepository && (
                <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">Saving detaches {existingRepository.name}.</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Colour</Label>
              <ProjectColorPicker value={color} onChange={setColor} />
            </div>

            {inherited.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  Inherited from parent folders
                </Label>
                <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
                  {inherited.map((ancestor) => (
                    <div key={ancestor.id}>
                      <p className="text-2xs font-medium text-muted-foreground">
                        {ancestor.title || 'Untitled'}
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground/90">
                        {ancestor.instructions}
                      </p>
                    </div>
                  ))}
                  <p className="text-2xs text-muted-foreground">
                    These are sent before your own instructions below. Yours win on conflict.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="project-instructions">Context / instructions</Label>
              <Textarea
                id="project-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={7}
                placeholder="e.g. Always answer in German. This project uses Bun, not npm."
                className="resize-y"
              />
              <p className={`text-2xs ${overBudget ? 'text-destructive' : 'text-muted-foreground'}`}>
                {instructions.length.toLocaleString()} / {MAX_INSTRUCTION_CHARS.toLocaleString()} characters
                {overBudget && ' — too long, trim it before saving'}
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => { void handleSave() }}
            disabled={saving || overBudget || (!isCreate && !project)}
          >
            {saving ? (isCreate ? 'Creating…' : 'Saving…') : isCreate ? 'Create' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <FolderPickerDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      initialPath={rootPath}
      initialNodeId={nodeId}
      onSelect={(path, selectedNodeId) => {
        setRootPath(path)
        setNodeId(selectedNodeId)
        // The browsed folder is now the source of truth; the gateway attaches
        // whatever .git it contains.
        setRepoId(null)
        setPickerOpen(false)
      }}
    />
    </>
  )
}
