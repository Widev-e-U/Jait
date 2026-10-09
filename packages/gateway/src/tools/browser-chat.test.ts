import { describe, expect, it, vi } from 'vitest';
import { createBrowserNavigateTool } from './browser-tools.js';
import { createSurfacesStartTool } from './surface-tools.js';
import { PreviewService } from '../services/preview.js';

function fixture() {
  const surfaces = new Map<string, any>();
  const registry = {
    getSurface: (id: string) => surfaces.get(id),
    startSurface: vi.fn(async (_type: string, id: string, input: any) => {
      const browser = {
        id, type: 'browser', state: 'running', sessionId: input.sessionId,
        snapshot: () => ({ id, type: 'browser', state: 'running', sessionId: input.sessionId, metadata: {} }),
        navigate: vi.fn().mockResolvedValue({ url: 'https://example.com/', title: 'Example', text: 'Hello', elements: [], activeElement: null, dialogs: [], obstruction: null }),
        inspect: async () => ({ snapshot: { url: 'about:blank', title: '', text: '', elements: [], activeElement: null, dialogs: [], obstruction: null } }),
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
    const a = await tool.execute({ type: 'browser' }, context('chat-a'));
    const b = await tool.execute({ type: 'browser' }, context('chat-a'));
    expect(a.data?.browserSession).toMatchObject({ sessionId: 'chat-a', controller: 'agent' });
    expect(a.data?.id).toBe(b.data?.id);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
    service.setSharedWithAgent('chat-a', false);
    expect((await tool.execute({ type: 'browser' }, context('chat-a'))).ok).toBe(false);
    expect(registry.startSurface).toHaveBeenCalledTimes(1);
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
  it('restarts an agent browser without creating a project server or dropping takeover', async () => {
    const { service, tool, context } = fixture();
    await tool.execute({ url: 'https://example.com' }, context('chat-a'));
    service.setSharedWithAgent('chat-a', false);
    expect(await service.restart('chat-a')).toMatchObject({ origin: 'agent', sharedWithAgent: false, processId: null });
    await expect(tool.execute({ url: 'https://example.com' }, context('chat-a'))).rejects.toThrow(/not shared/);
  });

});
