import { Component, type ReactNode } from 'react'
import { createLibrary, defineComponent, Renderer } from '@openuidev/react-lang'
import { z } from 'zod/v4'

// These components are deliberately presentation-only. Generated content has no
// access to tools, arbitrary HTML, remote resources, or executable actions.
const Text = defineComponent({
  name: 'Text', description: 'A paragraph of text',
  props: z.object({ text: z.string() }),
  component: ({ props }) => <p className="whitespace-pre-wrap text-sm">{props.text}</p>,
})
const Metric = defineComponent({
  name: 'Metric', description: 'A labeled value with optional context',
  props: z.object({ label: z.string(), value: z.string(), detail: z.string() }),
  component: ({ props }) => <div className="rounded-lg border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{props.label}</div><div className="text-xl font-semibold">{props.value}</div><div className="text-xs text-muted-foreground">{props.detail}</div></div>,
})
const Checklist = defineComponent({
  name: 'Checklist', description: 'A local interactive checklist; changes are not saved',
  props: z.object({ title: z.string(), items: z.array(z.string()) }),
  component: ({ props }) => <fieldset className="space-y-2"><legend className="font-medium">{props.title}</legend><p className="text-xs text-muted-foreground">Selections are temporary.</p>{(props.items ?? []).map((item, i) => <label key={i} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" /><span>{item}</span></label>)}</fieldset>,
})
const Details = defineComponent({
  name: 'Details', description: 'An expandable section of text',
  props: z.object({ title: z.string(), text: z.string() }),
  component: ({ props }) => <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">{props.title}</summary><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{props.text}</p></details>,
})
const Panel = defineComponent({
  name: 'Panel', description: 'A titled collection of content',
  props: z.object({ title: z.string(), children: z.array(z.union([Text.ref, Metric.ref, Checklist.ref, Details.ref])) }),
  component: ({ props, renderNode }) => <section className="not-prose my-3 space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-foreground"><h3 className="font-semibold">{props.title}</h3><div className="space-y-3">{renderNode(props.children)}</div></section>,
})

export const openuiLibrary = createLibrary({ root: 'Panel', components: [Panel, Text, Metric, Checklist, Details] })

class OpenUIBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <p role="alert">Unable to render this OpenUI block.</p> : this.props.children
  }
}

export function OpenUIBlock({ code, isStreaming }: { code: string; isStreaming: boolean }) {
  return <div className="not-prose">
    <OpenUIBoundary key={code}><Renderer response={code} library={openuiLibrary} isStreaming={isStreaming} /></OpenUIBoundary>
    {!isStreaming && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">OpenUI source</summary><pre className="overflow-x-auto whitespace-pre-wrap">{code}</pre></details>}
  </div>
}
