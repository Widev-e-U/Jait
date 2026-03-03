import { useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { FilePlus2, FolderOpen, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface WorkspaceFile {
  id: string
  name: string
  path: string
  content: string
  language: string
}

interface WorkspacePanelProps {
  files: WorkspaceFile[]
  activeFileId: string | null
  onActiveFileChange: (id: string) => void
  onOpenDirectory: () => void
  onFileDrop: (files: FileList | File[]) => void
  onReferenceFile: (file: WorkspaceFile) => void
}

function inferLanguage(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return 'plaintext'
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  if (ext === 'js' || ext === 'jsx') return 'javascript'
  if (ext === 'json') return 'json'
  if (ext === 'md') return 'markdown'
  if (ext === 'css') return 'css'
  if (ext === 'html') return 'html'
  if (ext === 'py') return 'python'
  if (ext === 'yml' || ext === 'yaml') return 'yaml'
  return 'plaintext'
}

export function workspaceLanguageForPath(path: string) {
  return inferLanguage(path)
}

export function WorkspacePanel({
  files,
  activeFileId,
  onActiveFileChange,
  onOpenDirectory,
  onFileDrop,
  onReferenceFile,
}: WorkspacePanelProps) {
  const [dragging, setDragging] = useState(false)
  const activeFile = useMemo(() => files.find((f) => f.id === activeFileId) ?? null, [files, activeFileId])

  return (
    <aside className="w-[560px] border-r bg-muted/20 shrink-0 flex min-h-0">
      <div
        className={`w-60 border-r bg-background transition-colors ${dragging ? 'bg-primary/5' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files?.length) {
            onFileDrop(event.dataTransfer.files)
          }
        }}
      >
        <div className="p-2 space-y-2 border-b">
          <Button variant="secondary" className="w-full justify-start" onClick={onOpenDirectory}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open directory
          </Button>
          <p className="text-[11px] text-muted-foreground leading-tight px-1">
            Drag and drop files/folders here, click to open, right-click to add as chat context.
          </p>
        </div>
        <ScrollArea className="h-[calc(100%-5.25rem)]">
          <div className="p-1">
            {files.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2">No files loaded yet.</div>
            ) : (
              files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => onActiveFileChange(file.id)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onReferenceFile(file)
                  }}
                  className={`group flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer text-xs ${
                    activeFileId === file.id ? 'bg-primary/15 text-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1" title={file.path}>{file.path}</span>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background"
                    onClick={(event) => {
                      event.stopPropagation()
                      onReferenceFile(file)
                    }}
                    title="Add to chat"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0 min-h-0">
        {activeFile ? (
          <Editor
            height="100%"
            theme="vs-dark"
            path={activeFile.path}
            language={activeFile.language}
            value={activeFile.content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Open a file from the explorer to preview it here.
          </div>
        )}
      </div>
    </aside>
  )
}
