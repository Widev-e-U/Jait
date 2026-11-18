import { createRoot } from 'react-dom/client'
import loader from '@monaco-editor/loader'
import { GitDiffViewer } from '@/components/automation/GitDiffViewer'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setAuthToken } from '@/lib/auth-token'
import '@/index.css'

// Exercise the real viewer and send flow without requiring the CDN-hosted editor.
const sides = ['original', 'modified'] as const
const sideEditors = Object.fromEntries(sides.map(side => {
  let listener: ((event: unknown) => void) | undefined
  return [side, {
    onDidChangeCursorSelection(callback: (event: unknown) => void) { listener = callback; return { dispose() {} } },
    hasTextFocus: () => true,
    select() { listener?.({ selection: { startLineNumber: 2, endLineNumber: 3, endColumn: 1 } }) },
    deltaDecorations: () => [],
    revealLineInCenter() {},
  }]
})) as Record<typeof sides[number], { onDidChangeCursorSelection: (callback: (event: unknown) => void) => { dispose: () => void }; hasTextFocus: () => boolean; select: () => void; deltaDecorations: () => never[]; revealLineInCenter: () => void }>
const monaco = {
  Uri: { parse: (value: string) => value },
  editor: {
    defineTheme() {}, setTheme() {}, getModel: () => null,
    createModel: () => ({ dispose() {} }),
    createDiffEditor(container: HTMLElement) {
      const select = document.createElement('button')
      select.textContent = 'Select modified line 2'
      select.onclick = () => sideEditors.modified.select()
      container.append(select)
      return {
        onDidUpdateDiff: () => ({ dispose() {} }),
        getOriginalEditor: () => sideEditors.original,
        getModifiedEditor: () => sideEditors.modified,
        getLineChanges: () => [], setModel() {}, updateOptions() {}, dispose() {},
      }
    },
  },
}
loader.init = (() => Object.assign(Promise.resolve(monaco), { cancel() {} })) as unknown as typeof loader.init
setAuthToken('fixture-token')
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<TooltipProvider><GitDiffViewer cwd="/repo" baseBranch="main" branch="feature" threadId="thread-1" onClose={() => {}} /></TooltipProvider>)
