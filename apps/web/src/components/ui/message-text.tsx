import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Root, Link, Definition } from 'mdast'
import { MessageLink } from './message-link'

/** Keep message text verbatim while linking Markdown links and GFM bare URLs.
 * Code and images stay literal; viewing a message never fetches embedded media.
 */
function remarkMessageLinks() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value)
    const definitions = new Map<string, Definition>()
    for (const node of tree.children) {
      if (node.type === 'definition') definitions.set(node.identifier.toUpperCase(), node)
    }
    const links: Link[] = []
    function visit(node: Root | Root['children'][number] | Link['children'][number]) {
      if (node.type === 'link') { links.push(node); return }
      if (node.type === 'linkReference') {
        const definition = definitions.get(node.identifier.toUpperCase())
        if (definition) links.push({ ...node, type: 'link', url: definition.url, title: definition.title })
        return
      }
      if ('children' in node) for (const child of node.children) visit(child)
    }
    visit(tree)
    const children: (Link | { type: 'text'; value: string })[] = []
    let cursor = 0
    for (const link of links) {
      const start = link.position?.start.offset
      const end = link.position?.end.offset
      if (start === undefined || end === undefined) continue
      children.push({ type: 'text', value: source.slice(cursor, start) }, link)
      cursor = end
    }
    children.push({ type: 'text', value: source.slice(cursor) })
    tree.children = [{ type: 'paragraph', children }]
  }
}

export const MessageText = memo(function MessageText({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMessageLinks]} skipHtml
    allowedElements={['a', 'p']} unwrapDisallowed components={{
      p: ({ children }) => <span>{children}</span>,
      a: ({ node: _node, ...props }) => <MessageLink {...props} />,
    }}>{children}</ReactMarkdown>
})
