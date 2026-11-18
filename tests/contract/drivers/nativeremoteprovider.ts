import { RemoteCliProvider } from '../../../packages/gateway/src/providers/remote-cli-provider.ts';

/** Uses the actual adapter; the peer only replaces the WS transport boundary. */
export async function dispatch(call: any): Promise<unknown> {
  const operations: unknown[] = [];
  const events: unknown[] = [];
  const aliases = new Map<string, string>();
  const sessions = new Map<string, string>();
  const pending = new Map<string, Promise<void>>();
  const outcomes: Record<string, unknown> = {};
  let active: any = {};
  let providers = call.providers ?? ['codex'];
  const realTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = new Map<object, {at:number; fire:()=>void}>();
  let elapsed = 0;
  if (call.manualTime) {
    globalThis.setTimeout = ((handler: (...args:any[])=>void, delay?:number, ...args:any[]) => {
      if(delay !== 1_800_000) return realTimeout(handler,delay,...args);
      const key = {};
      timers.set(key,{at:elapsed+delay,fire:()=>handler(...args)});
      return key;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer:any) => {
      if(timers.delete(timer)) return;
      realClearTimeout(timer);
    }) as typeof clearTimeout;
  }
  const ws: any = {
    onRemoteProviderEvent: undefined,
    findNodeByDeviceId: () => providers === null ? undefined : { providers },
    proxyProviderOp: async (nodeId: string, operation: string, params: any, timeoutMs = 60_000) => {
      if (operation === 'start-session') {
        aliases.set(params.sessionId, active.alias ?? 's');
        sessions.set(active.alias ?? 's', params.sessionId);
      }
      operations.push({nodeId, operation, params: structuredClone(params), timeoutMs});
      for (const event of active.events ?? []) {
        const value = replaceSession(event, params.sessionId);
        ws.onRemoteProviderEvent?.(params.sessionId, value);
      }
      if (active.error !== undefined) throw new Error(active.error);
      return active.reply ?? {};
    },
  };
  const provider = new RemoteCliProvider(ws, call.nodeId ?? 'node', call.providerId ?? 'codex', call.providerType ?? call.providerId ?? 'codex');
  const unsub = provider.onEvent(event => events.push(structuredClone(event)));
  const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
  const clean = (value: any): any => {
    if (typeof value === 'string') {
      for (const [id, alias] of aliases) value = value.replaceAll(id, alias);
      if (/^\d{4}-\d\d-\d\dT/.test(value)) return '<time>';
      return value;
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([key,v])=>[key,clean(v)]));
    return value;
  };
  function replaceSession(value: any, sessionId: string): any {
    if (value === '$session') return sessionId;
    if (Array.isArray(value)) return value.map(v=>replaceSession(v, sessionId));
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceSession(v,sessionId)]));
    return value;
  }
  const rows: unknown[] = [];
  try {
    for (const step of call.steps) {
      active = step;
      const id = sessions.get(step.session ?? 's') ?? step.session ?? 's';
      let value: unknown = null;
      try {
        switch(step.op) {
          case 'start': value = await provider.startSession(step.options ?? {threadId:'thread',workingDirectory:'/workspace',mode:'supervised'}); break;
          case 'send': {
            const key = step.key ?? 'turn';
            pending.set(key,provider.sendTurn(id,step.message ?? 'hello',step.attachments).then(()=>{outcomes[key]={ok:true};},error=>{outcomes[key]={error:error.message};}));
            break;
          }
          case 'event': ws.onRemoteProviderEvent?.(id,replaceSession(step.event,id)); break;
          case 'await': await pending.get(step.key ?? 'turn'); break;
          case 'advance': {
            elapsed += step.seconds * 1000;
            for(const [key,timer] of [...timers]) if(timer.at<=elapsed) {timers.delete(key);timer.fire();}
            break;
          }
          case 'stop': await provider.stopSession(id); break;
          case 'interrupt': await provider.interruptTurn(id); break;
          case 'approval': await provider.respondToApproval(id,'request',step.approved ?? false); break;
          case 'availability': providers = step.providers; value = await provider.checkAvailability(); break;
          case 'models': value = await provider.listModels(); break;
          case 'auth': value = await provider.getAuthStatus(); break;
          case 'login': value = await provider.startLogin(); break;
          case 'logout': value = await provider.logout(); break;
          case 'loginInput': provider.sendLoginInput(step.input); break;
          case 'unsubscribe': unsub(); break;
          default: throw new Error('Unknown fixture step '+step.op);
        }
      } catch(error) { value = {error:(error as Error).message}; }
      await flush();
      rows.push(clean({value,operations,events,outcomes,info:provider.info,subscribed:(provider as any).remoteEventUnsubscribe !== null}));
    }
    return rows;
  } finally {
    unsub();
    // Every fixture must settle turns, keeping the real adapter's long timers
    // from surviving the scenario or making a process appear to hang.
    for(const [alias,id] of sessions) ws.onRemoteProviderEvent?.(id,{type:'session.completed',sessionId:id});
    await Promise.all(pending.values());
    globalThis.setTimeout = realTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
}
