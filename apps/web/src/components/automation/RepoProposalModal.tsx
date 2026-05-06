import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { ProviderId, RepoProposal, RuntimeMode } from '@/lib/agents-api'

export function RepoProposalModal({
  open,
  onOpenChange,
  repoName,
  proposals,
  loading,
  defaultProvider,
  defaultRuntimeMode,
  defaultModel,
  onAdd,
  onRemove,
  onRun,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoName: string
  proposals: RepoProposal[]
  loading: boolean
  defaultProvider: ProviderId
  defaultRuntimeMode: RuntimeMode
  defaultModel?: string | null
  onAdd: (message: string) => Promise<void>
  onRemove: (proposalIds: string[]) => Promise<void>
  onRun: (proposalIds: string[], providerId: ProviderId, runtimeMode: RuntimeMode, model?: string | null) => Promise<void>
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedCount = selectedIds.length
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggle = (proposalId: string) => {
    setSelectedIds((prev) => prev.includes(proposalId)
      ? prev.filter((id) => id !== proposalId)
      : [...prev, proposalId])
  }

  const handleAdd = async () => {
    const message = newMessage.trim()
    if (!message) return
    setSubmitting(true)
    try {
      await onAdd(message)
      setNewMessage('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    if (selectedIds.length === 0) return
    setSubmitting(true)
    try {
      await onRemove(selectedIds)
      setSelectedIds([])
    } finally {
      setSubmitting(false)
    }
  }

  const handleRun = async () => {
    if (selectedIds.length === 0) return
    setSubmitting(true)
    try {
      await onRun(selectedIds, defaultProvider, defaultRuntimeMode, defaultModel)
      setSelectedIds([])
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agents Change Proposals</DialogTitle>
          <DialogDescription>
            Repo-wide todo prompts for `{repoName}`. They are also available from the Todo page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Add a recommended future user message..."
              disabled={submitting}
            />
            <Button onClick={() => void handleAdd()} disabled={submitting || !newMessage.trim()}>
              Add
            </Button>
          </div>

          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
              <span>{loading ? 'Loading todo items…' : `${proposals.length} item${proposals.length === 1 ? '' : 's'}`}</span>
              <Badge variant="secondary">{selectedCount} selected</Badge>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {proposals.length === 0 ? (
                <div className="px-3 py-8 text-sm text-muted-foreground">
                  No saved todo items yet.
                </div>
              ) : (
                proposals.map((proposal) => (
                  <label
                    key={proposal.id}
                    className="flex items-start gap-3 border-b px-3 py-3 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={selectedSet.has(proposal.id)}
                      onChange={() => toggle(proposal.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-5 text-foreground whitespace-pre-wrap">{proposal.message}</p>
                      {proposal.sourceThreadTitle && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Suggested by `{proposal.sourceThreadTitle}`
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => void handleRemove()} disabled={submitting || selectedIds.length === 0}>
              Remove
            </Button>
            <Button onClick={() => void handleRun()} disabled={submitting || selectedIds.length === 0}>
              Run
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
