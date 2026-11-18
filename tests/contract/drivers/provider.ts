/** Test-only provider bridge. Rust supplies fixtures and assertions. */
import { deriveOllamaResetWindow, parseOllamaResetSource, describeOllamaResetSource } from '../../../packages/gateway/src/services/provider-reset-windows.ts';
import { normalizeReasoningEffort, resolveThreadSelectionDefaults } from '../../../packages/gateway/src/services/thread-defaults.ts';
import { mapCodexNotification } from '../../../packages/gateway/src/providers/codex-event-mapper.ts';

export async function dispatch(call: any): Promise<any> {
  switch (call.op) {
    case 'provider.reset': return deriveOllamaResetWindow({ ...call.input, now: new Date(call.input.now) });
    case 'provider.reset-millis': {
      // Numeric projection of the same derivation: the original tests compare
      // instants (toBeGreaterThan / getUTCHours), which ISO strings cannot express.
      const now = new Date(call.input.now);
      const window = deriveOllamaResetWindow({ ...call.input, now });
      return {
        resetsAtMs: typeof window.resetsAt === 'string' ? Date.parse(window.resetsAt) : null,
        windowStartMs: typeof window.windowStartAt === 'string' ? Date.parse(window.windowStartAt) : null,
        nowMs: now.getTime(),
        resetsAtHourUtc: typeof window.resetsAt === 'string' ? new Date(window.resetsAt).getUTCHours() : null,
        source: window.source,
      };
    }
    case 'provider.reset-parse': return parseOllamaResetSource(call.value);
    case 'provider.reset-describe': return describeOllamaResetSource(call.value);
    case 'provider.effort': return normalizeReasoningEffort(call.value) ?? null;
    // Replays a batch in one process so the mapper's module-level fallback-id
    // counter advances exactly as it does in production; the native side keeps
    // the same single shared counter, and the test normalizes the numeric tail.
    case 'provider.codex-event-map': return call.calls.map((entry: any) =>
      mapCodexNotification(entry.method, entry.params, entry.sessionId ?? 'session-1'));
    case 'provider.thread': {
      const reads: string[] = [];
      const options: any = { userId: call.userId, sessionId: call.sessionId };
      if ('chatProvider' in call) options.userService = { getSettings: (userId: string) => ({
        userId, theme: 'system', apiKeys: {}, disabledTools: [], sttProvider: 'whisper',
        chatProvider: call.chatProvider, jaitBackend: 'openai', recentModels: [],
        workspacePickerPath: null, workspacePickerNodeId: null, updatedAt: new Date().toISOString(),
      }) };
      if ('state' in call) options.sessionState = { get: (sessionId: string, keys?: string[]) => {
        reads.push(sessionId);
        return Object.fromEntries(Object.entries(call.state).filter(([key]) => !keys?.length || keys.includes(key)));
      } };
      return { result: resolveThreadSelectionDefaults(options), reads };
    }
    case 'provider.usage': {
      const { openDatabase, migrateDatabase } = await import('../../../packages/gateway/src/db/connection.ts');
      const { ProviderUsageService } = await import('../../../packages/gateway/src/services/provider-usage.ts');
      const { providerUsage } = await import('../../../packages/gateway/src/db/schema.ts');
      const opened = await openDatabase(':memory:');
      const originalLog = console.log;
      const OriginalDate = Date;
      try {
        console.log = (...args) => console.error(...args);
        migrateDatabase(opened.sqlite);
        console.log = originalLog;
        const service = new ProviderUsageService(opened.db);
        const warnings: unknown[][] = [];
        if (call.notifications) service.attachNotifications({ warning: (...args: unknown[]) => { warnings.push(args); } } as any);
        const events: any[] = [];
        for (const action of call.actions) {
          if (action.op === 'clock') {
            const instant = new OriginalDate(action.value).getTime();
            globalThis.Date = class extends OriginalDate {
              constructor(...args: any[]) { super(...(args.length ? args : [instant]) as [any]); }
              static now() { return instant; }
            } as DateConstructor;
          } else if (action.op === 'seed') {
            opened.db.insert(providerUsage).values(action.value).run();
          } else if (action.op === 'list') {
            events.push(service.listForUser(action.ids));
          } else if (action.op === 'warnings') {
            events.push(structuredClone(warnings));
          } else if (action.op === 'claude') {
            service.recordClaudeRateLimit(action.account, action.provider, action.value);
          } else if (action.op === 'codex') {
            service.recordCodexRateLimits(action.account, action.value);
          } else if (action.op === 'ollama') {
            service.recordOllamaUsage(action.account, action.value, action.plan, action.label);
          } else if (action.op === 'go') {
            service.recordOpenCodeGoUsage(action.account, action.value);
          } else throw new Error('unknown provider usage action');
        }
        return events;
      } finally {
        console.log = originalLog;
        globalThis.Date = OriginalDate;
        opened.sqlite.close();
      }
    }
    default: throw new Error('unknown provider operation');
  }
}
