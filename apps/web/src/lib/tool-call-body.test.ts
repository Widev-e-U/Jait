import { describe, expect, it } from 'vitest'
import { canRenderEditDiff, getMcpToolLabel, getToolCallBodyKind, getToolFilePath, normalizeToolArgs, summarizeToolArguments } from './tool-call-body'

describe('tool call body helpers', () => {
  it('does not force a diff view for codex edit calls that only provide a path', () => {
    expect(canRenderEditDiff('edit', { path: 'apps/web/src/App.tsx' })).toBe(false)
    expect(
      getToolCallBodyKind({
        tool: 'edit',
        args: { path: 'apps/web/src/App.tsx' },
        status: 'success',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('none')
  })

  it('keeps web calls without output as compact rows instead of empty expanders', () => {
    expect(
      getToolCallBodyKind({
        tool: 'web',
        args: { query: 'openai codex' },
        status: 'success',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('none')
  })

  it('renders an edit diff when replacement details are present', () => {
    expect(canRenderEditDiff('edit', { path: 'a.ts', search: 'a', replace: 'b' })).toBe(true)
    expect(
      getToolCallBodyKind({
        tool: 'edit',
        args: { path: 'a.ts', search: 'a', replace: 'b' },
        status: 'success',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('editDiff')
  })

  it('normalizes provider-specific edit argument aliases', () => {
    expect(
      normalizeToolArgs('edit', {
        file_path: 'apps/web/src/App.tsx',
        old_string: 'before',
        new_string: 'after',
      }),
    ).toMatchObject({
      path: 'apps/web/src/App.tsx',
      search: 'before',
      replace: 'after',
    })
  })

  it('backfills edit aliases from nested result payloads', () => {
    expect(
      normalizeToolArgs(
        'edit',
        {},
        {
          result: {
            file_path: 'apps/web/src/App.tsx',
            old_string: 'before',
            new_string: 'after',
          },
        },
      ),
    ).toMatchObject({
      path: 'apps/web/src/App.tsx',
      search: 'before',
      replace: 'after',
    })
  })

  it('uses provider title/name fields as edit path fallback', () => {
    expect(
      normalizeToolArgs('edit', {
        title: 'apps/web/src/components/chat/tool-call-card.tsx',
      }),
    ).toMatchObject({
      path: 'apps/web/src/components/chat/tool-call-card.tsx',
    })
  })

  it('parses stringified nested edit input payloads', () => {
    expect(
      normalizeToolArgs('edit', {
        input: JSON.stringify({
          file_path: 'apps/web/src/App.tsx',
          old_string: 'before',
          new_string: 'after',
        }),
      }),
    ).toMatchObject({
      path: 'apps/web/src/App.tsx',
      search: 'before',
      replace: 'after',
    })
  })

  it('normalizes provider-specific web argument aliases', () => {
    expect(
      normalizeToolArgs('web', {
        searchQuery: 'openai codex',
      }),
    ).toMatchObject({
      query: 'openai codex',
    })
  })

  it('builds readable summaries for generic tool arguments', () => {
    expect(
      summarizeToolArguments({
        action: 'create',
        workingDirectory: '/home/jakob/jait',
        start: true,
      }),
    ).toBe('action: create • working directory: /home/jakob/jait • start: true')
  })

  it('extracts MCP tool identity and argument details from nested payloads', () => {
    expect(
      getMcpToolLabel({
        recipient_name: 'functions.mcp__jait__thread_control',
        arguments: JSON.stringify({
          action: 'create',
          title: 'Reduce tool cards',
          start: true,
        }),
      }),
    ).toEqual({
      title: 'functions.mcp__jait__thread_control',
      details: 'action: create • title: Reduce tool cards • start: true',
    })
  })

  it('extracts edited file paths from result messages when args omit the path', () => {
    expect(
      getToolFilePath('edit', {}, undefined, 'Edited apps/web/src/components/chat/tool-call-card.tsx successfully'),
    ).toBe('apps/web/src/components/chat/tool-call-card.tsx')
  })

  it('extracts edited file paths from codex change payloads', () => {
    expect(
      getToolFilePath('edit', {
        path: '',
        changes: [
          {
            path: '/tmp/jait-codex-test/sample.txt',
          },
        ],
      }),
    ).toBe('/tmp/jait-codex-test/sample.txt')
  })
})
