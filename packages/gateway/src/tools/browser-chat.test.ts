import { describe, expect, it, vi } from 'vitest';
import { createBrowserOpenTool, createBrowserInspectTool, createBrowserNavigateTool } from './browser-tools.js';
import { createSurfacesStartTool } from './surface-tools.js';
import { createPreviewOpenTool } from './preview-tools.js';
import { PreviewService } from '../services/preview.js';
import { UserQuestionService } from '../services/user-questions.js';
import { createBrowserHandoffTool } from './browser-handoff.js';

function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      let currentUrl = 'about:blank';
      const page = () => ({ url: currentUrl, title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null });
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: { currentUrl } }),
        navigate: vi.fn(async (url: string) => { currentUrl = url; return page(); }),
        inspect: vi.fn(async () => ({ snapshot: page() })),
        getEvents: () => [], getMetrics: async () => null,
        getLiveViewInfo: () => ({ novncUrl: 'ws://localhost:6080', vncPort: 5900, websockifyPort: 6080 }),
      };
      surfaces.set(id, browser);
      return browser;
    }),
    stopSurface: vi.fn(async (id: string) => { surfaces.delete(id); }),
  };
  const service = new PreviewService(registry as any);
  const tool = createBrowserNavigateTool(registry as any, service);
  const context = (sessionId: string) => ({ sessionId, actionId: 'test', requestedBy: 'assistant', projectRoot: '/project' });
  return { registry, service, tool, context };
}

describe('chat agent browser', () => {
  it('blocks browser actions throughout handoff and resumes only after Done', async () => {
    const { service, tool, context, registry } = fixture();
    const chat = context('handoff-chat');
    await tool.execute({ url: 'https://example.com' }, chat);
    const browser = registry.getSurface(service.get('handoff-chat')!.browserId!);
    const questions = new UserQuestionService();
    const handoff = createBrowserHandoffTool(service, questions);
    const waiting = handoff.execute({ message: 'Sign in directly in the browser.' }, chat);
    expect(service.get('handoff-chat')?.sharedWithAgent).toBe(false);
    await expect(tool.execute({ url: 'https://example.com/next' }, chat)).rejects.toThrow(/not shared/);
    expect(browser.navigate).toHaveBeenCalledTimes(1);
    const [request] = questions.listPending('handoff-chat');
    questions.submit(request.id, { answers: { browser: { selected: ['Done'], freeText: null, skipped: false } } });
    expect(await waiting).toMatchObject({ data: { status: 'done' } });
    await tool.execute({ url: 'https://example.com/next' }, chat);
    expect(browser.navigate).toHaveBeenCalledTimes(2);
  });

  it('opens a usable agent preview and preserves takeover across reuse and replacement', async () => {
    const { service, context } = fixture();
    const open = createPreviewOpenTool(undefined, undefined, service);
    const result = await open.execute({ target: '4173' }, context('agent-preview'));
    expect(result.ok).toBe(true);
    expect(service.get('agent-preview')?.sharedWithAgent).toBe(true);
    expect(() => service.assertAgentControl(result.data!.browserId as string)).not.toThrow();
    service.setSharedWithAgent('agent-preview', false);
    await open.execute({ target: '4173' }, context('agent-preview'));
    expect(service.get('agent-preview')?.sharedWithAgent).toBe(false);
    await open.execute({ target: '4174' }, context('agent-preview'));
    expect(service.get('agent-preview')?.sharedWithAgent).toBe(false);
    await service.restart('agent-preview');
    expect(service.get('agent-preview')?.sharedWithAgent).toBe(false);
    expect(() => service.assertAgentControl(service.get('agent-preview')!.browserId!)).toThrow(/not shared/);
    service.setSharedWithAgent('agent-preview', true);
    expect(() => service.assertAgentControl(service.get('agent-preview')!.browserId!)).not.toThrow();
    const userPreview = await service.start({ sessionId: 'user-preview', target: '4173' });
    expect(userPreview.sharedWithAgent).toBe(true);
  });

  it('exposes a live browser for each chat without starting a project server', async () => {
    const { service, tool, context } = fixture();
    const a = await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    const b = await tool.execute({ url: 'https://example.com' }, context('chat-b'));
    expect(a.data?.browserId).not.toBe(b.data?.browserId);
    expect(a.data?.browserSession).toMatchObject({ sessionId: 'chat-a', controller: 'agent', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' });
    expect(service.get('chat-a')).toMatchObject({ sharedWithAgent: true, processId: null, origin: 'agent' });
  });
  it('blocks browser tools during user takeover and permits explicit resumption', async () => {
    const { service, tool, context, registry } = fixture();
    const first = await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    const browser = registry.getSurface(first.data!.browserId as string);
    service.setSharedWithAgent('chat-a', false);
    await expect(tool.execute({ url: 'https://example.com/private' }, context('chat-a'))).rejects.toThrow(/not shared/);
    expect(browser.navigate).toHaveBeenCalledTimes(1);
    service.setSharedWithAgent('chat-a', true);
    await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    expect(browser.navigate).toHaveBeenCalledTimes(2);
  });
  it('rejects a browser owned by another chat', async () => {
    const { tool, context } = fixture();
    const first = await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    await expect(tool.execute({ url: 'https://example.com', browserId: first.data!.browserId as string }, context('chat-b'))).rejects.toThrow(/another chat/);
  });
  it('shows surfaces.start browsers in the chat and reuses the same browser', async () => {
    const { registry, service, context } = fixture();
    const tool = createSurfacesStartTool(registry as any, service);
    const a = await tool.execute({ type: 'browser', url: 'https://example.com/one' }, context('chat-a'));
    const b = await tool.execute({ type: 'browser', url: 'https://example.com/two' }, context('chat-a'));
    expect(registry.getSurface(a.data!.id as string).navigate).toHaveBeenLastCalledWith('https://example.com/two', undefined);
    expect(a.data?.browserSession).toMatchObject({ sessionId: 'chat-a', controller: 'agent' });
    expect(a.data?.id).toBe(b.data?.id);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
    service.setSharedWithAgent('chat-a', false);
    expect((await tool.execute({ type: 'browser', url: 'https://example.com/three' }, context('chat-a'))).ok).toBe(false);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
  });
  it('does not create a blank browser when an inspection runs before navigation', async () => {
    const { registry, service, context } = fixture();
    const inspect = createBrowserInspectTool(registry as any, service);
    await expect(inspect.execute({}, context('chat-a'))).rejects.toThrow(/browser.open with a URL/);
    expect(registry.startSurface).not.toHaveBeenCalled();
  });
  it('opens a live browser without a URL, then inspects without losing the current page', async () => {
    const { registry, service, context } = fixture();
    const open = createBrowserOpenTool(registry as any, service);
    const chat = context('unified');
    expect(await open.execute({}, chat)).toMatchObject({ ok: true, data: { url: 'about:blank' } });
    expect(registry.startSurface).toHaveBeenCalledWith('browser', 'browser-unified', expect.objectContaining({ requireLiveView: true }));
    await open.execute({ url: 'https://example.com/page', selector: '#save' }, chat);
    const browser = registry.getSurface('browser-unified');
    expect(browser.inspect).toHaveBeenLastCalledWith('#save', undefined);
    browser.navigate.mockClear();
    expect(await open.execute({ selector: '#save' }, chat)).toMatchObject({ ok: true, data: { url: 'https://example.com/page' } });
    expect(browser.navigate).not.toHaveBeenCalled();
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
    service.setSharedWithAgent('unified', false);
    await expect(open.execute({}, chat)).rejects.toThrow();
  });
  it('does not start a browser for cancelled or sessionless inspection', async () => {
    const { registry, service, context } = fixture();
    const open = createBrowserOpenTool(registry as any, service);
    expect(await open.execute({}, context(''))).toMatchObject({ ok: false });
    expect(await open.execute({}, { ...context('cancelled'), signal: AbortSignal.abort() })).toMatchObject({ ok: false, message: 'Cancelled' });
    expect(registry.startSurface).not.toHaveBeenCalled();
  });
  it('suppresses unified inspection for secret-safe sessions', async () => {
    const { registry, service, context } = fixture();
    const open = createBrowserOpenTool(registry as any, service);
    const chat = context('unified-secret');
    await open.execute({ url: 'https://example.com' }, chat);
    const browserId = service.get('unified-secret')!.browserId!;
    vi.spyOn(service, 'getSessionByBrowserId').mockReturnValue({ ...service.getSessionByBrowserId(browserId)!, secretSafe: true } as any);
    const result = await open.execute({}, chat);
    expect(result).toMatchObject({ ok: true, data: { captureSuppressed: true } });
    expect(JSON.stringify(result)).not.toContain('Hello');
  });
  it('deduplicates simultaneous browser starts', async () => {
    const { registry, tool, context } = fixture();
    const [a, b] = await Promise.all([
      tool.execute({ url: 'https://example.com' }, context('chat-a')),
      tool.execute({ url: 'https://example.com' }, context('chat-a')),
    ]);
    expect(a.data?.browserId).toBe(b.data?.browserId);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
  });
  it('recovers an idle browser with its page and takeover state', async () => {
    const { service, tool, context, registry } = fixture();
    await tool.execute({ url: 'https://example.com/page' }, context('idle-chat'));
    service.setSharedWithAgent('idle-chat', false);
    const browserId = service.get('idle-chat')!.browserId!;
    expect(await service.suspendIdleAgentBrowser(browserId)).toBe(true);
    expect(service.get('idle-chat')).toMatchObject({ status: 'stopped', target: 'https://example.com/page' });
    const [first, second] = await Promise.all([service.restart('idle-chat'), service.restart('idle-chat')]);
    expect(first).toMatchObject({ status: 'ready', sharedWithAgent: false });
    expect(second?.browserId).toBe(first?.browserId);
    expect(registry.getSurface(browserId).navigate).toHaveBeenCalledWith('https://example.com/page');
    expect(registry.startSurface).toHaveBeenCalledTimes(2);
  });

  it('opens the next URL after idle suspension without a separate restart call', async () => {
    const { service, tool, context, registry } = fixture();
    const chat = context('idle-open');
    await tool.execute({ url: 'https://example.com/page' }, chat);
    const browserId = service.get('idle-open')!.browserId!;
    await service.suspendIdleAgentBrowser(browserId);
    const result = await tool.execute({ url: 'https://example.com/next' }, chat);
    expect(result).toMatchObject({ ok: true, data: { browserId, url: 'https://example.com/next' } });
    expect(registry.startSurface).toHaveBeenCalledTimes(2);
    expect(service.get('idle-open')).toMatchObject({ status: 'ready', sharedWithAgent: true });
  });

  it('preserves user takeover when opening a suspended browser', async () => {
    const { service, tool, context, registry } = fixture();
    const chat = context('idle-takeover');
    await tool.execute({ url: 'https://example.com/page' }, chat);
    service.setSharedWithAgent('idle-takeover', false);
    await service.suspendIdleAgentBrowser(service.get('idle-takeover')!.browserId!);
    await expect(tool.execute({ url: 'https://example.com/next' }, chat)).rejects.toThrow(/not shared/);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
  });

  it('restarts an agent browser without creating a project server or dropping takeover', async () => {
    const { service, tool, context, registry } = fixture();
    await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    service.setSharedWithAgent('chat-a', false);
    expect(await service.restart('chat-a')).toMatchObject({ origin: 'agent', sharedWithAgent: false, processId: null });
    expect(registry.getSurface(service.get('chat-a')!.browserId!).navigate).toHaveBeenCalledWith('https://example.com');
    await expect(tool.execute({ url: 'https://example.com' }, context('chat-a'))).rejects.toThrow(/not shared/);
  });

});
