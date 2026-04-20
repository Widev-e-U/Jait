import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TodoList } from './todo-list'

describe('TodoList', () => {
  it('shows the active task and spinner while collapsed', () => {
    const markup = renderToStaticMarkup(
      <TodoList
        items={[
          { id: 1, title: 'Map existing architecture', status: 'completed' },
          { id: 2, title: 'Patch collapsed task row', status: 'in-progress' },
          { id: 3, title: 'Verify UI behavior', status: 'not-started' },
        ]}
      />,
    )

    expect(markup).toContain('Patch collapsed task row')
    expect(markup).toContain('animate-spin')
  })

  it('shows a green completed summary while collapsed', () => {
    const markup = renderToStaticMarkup(
      <TodoList
        items={[
          { id: 1, title: 'Map existing architecture', status: 'completed' },
          { id: 2, title: 'Patch collapsed task row', status: 'completed' },
          { id: 3, title: 'Verify UI behavior', status: 'completed' },
        ]}
      />,
    )

    expect(markup).toContain('All tasks completed')
    expect(markup).toContain('text-green-600')
  })
})
