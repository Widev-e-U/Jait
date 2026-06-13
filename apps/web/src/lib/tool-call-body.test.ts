import { describe, expect, it } from 'vitest'
import { canRenderEditDiff, getMcpToolLabel, getToolCallBodyKind, getToolFilePath, getToolFilePaths, getToolImagePath, isMcpToolName, normalizeToolArgs, normalizeToolName, summarizeToolArguments } from './tool-call-body'

describe('tool call body helpers', () => {
  it('normalizes multi-segment tool names used by tool cards', () => {
    expect(normalizeToolName('ssh_session_start')).toBe('ssh.session.start')
    expect(normalizeToolName('ssh_session_run')).toBe('ssh.session.run')
    expect(normalizeToolName('ssh_session_close')).toBe('ssh.session.close')
    expect(normalizeToolName('read_file')).toBe('file.read')
    expect(normalizeToolName('write_file')).toBe('file.write')
    expect(normalizeToolName('patch_file')).toBe('file.patch')
    expect(normalizeToolName('replace_string_in_file')).toBe('edit')
    expect(normalizeToolName('insert_edit_into_file')).toBe('edit')
    expect(normalizeToolName('create_file')).toBe('file.write')
    expect(normalizeToolName('jait_terminal')).toBe('jait.terminal')
    expect(normalizeToolName('spawn_agent')).toBe('agent.spawn')
    expect(normalizeToolName('functions.spawn_agent')).toBe('agent.spawn')
    expect(normalizeToolName('wait_agent')).toBe('agent.wait')
    expect(normalizeToolName('browser_sandbox_start')).toBe('browser.sandbox.start')
    expect(normalizeToolName('project_create')).toBe('project.create')
    expect(normalizeToolName('project_assign_repository')).toBe('project.assign_repository')
  })

  it('extracts file paths from ACP-style read/write tool aliases', () => {
    expect(getToolFilePath('read_file', { file_path: 'apps/web/src/App.tsx' })).toBe('apps/web/src/App.tsx')
    expect(getToolFilePath('write_file', { path: 'packages/gateway/src/index.ts' })).toBe('packages/gateway/src/index.ts')
  })

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

  it('renders thread control create_many calls as thread lists', () => {
    expect(
      getToolCallBodyKind({
        tool: 'thread_control',
        args: {
          action: 'create_many',
          threads: [
            { title: 'Backend' },
            { title: 'Frontend' },
          ],
        },
        status: 'running',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('threadList')
  })

  it('renders provider-native agent calls as subagent cards', () => {
    expect(
      getToolCallBodyKind({
        tool: 'spawn_agent',
        args: { agent_type: 'explorer', message: 'Inspect the repo' },
        status: 'running',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('subagent')

    expect(
      getToolCallBodyKind({
        tool: 'wait_agent',
        args: { targets: ['agent-1'] },
        status: 'running',
        displayOutput: '',
        snapshotText: null,
        screenshotPath: null,
      }),
    ).toBe('subagent')
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

  it('normalizes ACP edit aliases and diff fields', () => {
    expect(
      normalizeToolArgs('replace_string_in_file', {
        targetFile: 'packages/gateway/src/providers/acp-provider.ts',
        old_str: 'before',
        new_str: 'after',
      }),
    ).toMatchObject({
      path: 'packages/gateway/src/providers/acp-provider.ts',
      search: 'before',
      replace: 'after',
    })
    expect(canRenderEditDiff('replace_string_in_file', {
      targetFile: 'packages/gateway/src/providers/acp-provider.ts',
      old_str: 'before',
      new_str: 'after',
    })).toBe(true)
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
        workingDirectory: '/home/user/project',
        start: true,
      }),
    ).toBe('action: create • working directory: /home/user/project • start: true')
  })

  it('omits provider wrapper arguments from generic summaries', () => {
    expect(
      summarizeToolArguments({
        arguments: { action: 'create' },
        status: 'running',
      }),
    ).toBe('status: running')
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

  it('omits redundant MCP wrapper identity fields from top-level details', () => {
    expect(
      getMcpToolLabel({
        recipient_name: 'mcp.jait.terminal.run',
        server: 'jait',
        tool: 'terminal_run',
        title: 'mcp.jait.terminal.run',
      }),
    ).toEqual({
      title: 'mcp.jait.terminal.run',
      details: null,
    })
  })

  it('omits redundant identity fields (tool/server/wrapper title) from nested details', () => {
    expect(
      getMcpToolLabel({
        recipient_name: 'mcp.jait.file_patch',
        arguments: JSON.stringify({
          server: 'jait',
          tool: 'file_patch',
          title: 'mcp.jait.file_patch',
          path: 'apps/web/src/App.tsx',
        }),
      }),
    ).toEqual({
      title: 'mcp.jait.file_patch',
      details: 'path: apps/web/src/App.tsx',
    })
  })

  it('treats direct MCP tool names as MCP cards without wrapper field summaries', () => {
    expect(isMcpToolName('mcp.jait.file.read')).toBe(true)
    expect(
      getMcpToolLabel({
        title: 'mcp.jait.file_read',
        server: 'jait',
        tool: 'file_read',
      }),
    ).toEqual({
      title: 'mcp.jait.file_read',
      details: null,
    })
  })

  it('extracts edited file paths from result messages when args omit the path', () => {
    expect(
      getToolFilePath('edit', {}, undefined, 'Edited apps/web/src/components/chat/tool-call-card.tsx successfully'),
    ).toBe('apps/web/src/components/chat/tool-call-card.tsx')
  })

  it('extracts ACP content-wrapper paths when args omit the path', () => {
    expect(
      getToolFilePath(
        'read_file',
        {},
        [
          {
            type: 'content',
            content: {
              type: 'text',
              text: 'Read apps/web/src/App.tsx',
            },
          },
        ],
        'Read apps/web/src/App.tsx',
      ),
    ).toBe('apps/web/src/App.tsx')
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

  it('extracts multiple edited file paths from structured result payloads', () => {
    expect(
      getToolFilePaths(
        'edit',
        {},
        {
          changes: [
            { file_path: 'apps/web/src/App.tsx' },
            { path: 'packages/gateway/src/routes/threads.ts' },
          ],
        },
      ),
    ).toEqual([
      'apps/web/src/App.tsx',
      'packages/gateway/src/routes/threads.ts',
    ])
  })

  it('extracts screenshot paths from structured result payloads', () => {
    expect(
      getToolImagePath(
        'mcp-tool',
        {},
        {
          result: {
            path: '/home/user/project/.tmp/jait-preview-live.png',
          },
        },
      ),
    ).toBe('/home/user/project/.tmp/jait-preview-live.png')
  })

  it('extracts screenshot paths from result messages', () => {
    expect(
      getToolImagePath(
        'browser.screenshot',
        {},
        undefined,
        'Saved screenshot to /home/user/project/.tmp/jait-preview-live.png',
      ),
    ).toBe('/home/user/project/.tmp/jait-preview-live.png')
  })
})
