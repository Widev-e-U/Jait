/** Reference calls only. Rust owns expected values, verdicts, and mutation controls. */
import { homedir } from 'node:os';
// Preload Bun's node:crypto shim before simulating a host without global crypto.
import { webcrypto } from 'node:crypto';
import { join } from 'node:path';
import type * as Jose from '../../../packages/gateway/node_modules/jose/dist/types/index.d.ts';
const jose: typeof Jose = await import(new URL('../../../packages/gateway/node_modules/jose/dist/webapi/index.js', import.meta.url).href);
import { existsSync, readFileSync } from 'node:fs';

// CI runners install node outside /usr/bin (hosted toolcache), so resolve the interpreter
// from PATH once instead of trusting a fixed location. JAIT_CONTRACT_NODE pins it explicitly.
const nodeBinary: string = (() => {
  const override = process.env.JAIT_CONTRACT_NODE;
  if (override) return override;
  const bunWhich = (globalThis as { Bun?: { which?: (name: string) => string | null } }).Bun?.which;
  const resolved = typeof bunWhich === 'function' ? bunWhich('node') : null;
  if (resolved) return resolved;
  for (const candidate of ['/usr/bin/node', '/usr/local/bin/node']) if (existsSync(candidate)) return candidate;
  return 'node';
})();

// Every dynamically loaded module sees an isolated fixture environment.
process.env.__JAIT_CLI = '1';

// Exact reviewed inventory. Mutations redirect one entry to an isolated source copy.
export const sources: Record<string, string> = {
  "networkScanHelpers": "../../../packages/gateway/src/lib/network-scan.ts",
  reusedSessionRoutes: '../../../packages/gateway/src/routes/sessions.ts',
  reusedProjectTools: '../../../packages/gateway/src/tools/project-tools.ts',
  reusedDiskJanitor: '../../../packages/gateway/src/services/disk-janitor.ts',
  reusedSecurityEngines: '../../../packages/gateway/src/lib/security/engines.ts',
  reusedPreviewTools: '../../../packages/gateway/src/tools/preview-tools.ts',
  reusedSchedulerService: '../../../packages/gateway/src/scheduler/service.ts',
  reusedJobRoutes: '../../../packages/gateway/src/routes/jobs.ts',
  reusedAcpRunner: '../../../packages/gateway/src/tools/agent-acp-runner.ts',
  reusedFilesystem: '../../../packages/gateway/src/surfaces/filesystem.ts',
  "maintenanceService": "../../../packages/gateway/src/services/maintenance.ts",
  "agentGithubTools": "../../../packages/gateway/src/tools/agent-github-tools.ts",
  reusedElevatedTools: '../../../packages/gateway/src/tools/elevated-tools.ts',
  reusedPreviewRunner: '../../../packages/gateway/src/services/preview-runner.ts',
  reusedProjectMessage: '../../../packages/gateway/src/tools/project-message-tool.ts',
  reusedReminderRoutes: '../../../packages/gateway/src/routes/reminders.ts',
  reusedTelegramConnector: '../../../packages/gateway/src/channels/telegram/connector.ts',
  reusedMsTeamsConnector: '../../../packages/gateway/src/channels/msteams/connector.ts',
  reusedBrowserDevtools: '../../../packages/gateway/src/routes/browser-devtools.ts',
  reusedRemoteCliProvider: '../../../packages/gateway/src/providers/remote-cli-provider.ts',
  reusedHostSoftware: '../../../packages/gateway/src/lib/security/host-software.ts',
  reusedPlanRoutes: '../../../packages/gateway/src/routes/plans.ts',
  reusedRepositoryRoutes: '../../../packages/gateway/src/routes/repositories.ts',
  reusedVoiceRoutes: '../../../packages/gateway/src/routes/voice.ts',
  reusedScreenshotPaths: '../../../packages/gateway/src/tools/screenshot-tools.ts',
  reusedMobileRoutes: '../../../packages/gateway/src/routes/mobile.ts',
  reusedConsentManager: '../../../packages/gateway/src/security/consent-manager.ts',
  clawhubClient: '../../../packages/gateway/src/clawhub/client.ts',
  messengerRoutes: '../../../packages/gateway/src/routes/messenger.ts',
  reusedConsentRoutes: '../../../packages/gateway/src/routes/consent.ts',
  reusedRemoteTerminal: '../../../packages/gateway/src/surfaces/remote-terminal.ts',
  reusedSqliteShim: '../../../packages/gateway/src/db/sqlite-shim.ts',
  reusedJaitLlm: '../../../packages/gateway/src/services/jait-llm.ts',
  reusedOsControlTools: '../../../packages/gateway/src/tools/os-control-tools.ts',
  reusedWindowsDesktop: '../../../packages/gateway/src/os-control/windows-driver.ts',
  reusedLinuxDesktop: '../../../packages/gateway/src/os-control/linux-desktop-driver.ts',
  reusedRemoteFilesystem: '../../../packages/gateway/src/surfaces/remote-filesystem.ts',
  assessmentRuntime: '../../../packages/gateway/src/security/assessment.ts',
  reusedThreadReviewSync: '../../../packages/gateway/src/services/thread-review-sync.ts',
  reusedGraphifyRuntime: '../../../packages/gateway/src/services/code-graph/graphify-runtime.ts',
  reusedDoctor: '../../../packages/gateway/src/cli/doctor.ts',
  reusedProviderAuth: '../../../packages/gateway/src/providers/provider-auth.ts',
  reusedCodexEventMapper: '../../../packages/gateway/src/providers/codex-event-mapper.ts',
  reusedUpdateRoutes: '../../../packages/gateway/src/routes/update.ts',
  reusedCalendarService: '../../../packages/gateway/src/services/calendar/service.ts',
  reusedEmailService: '../../../packages/gateway/src/services/email/service.ts',
  reusedSkillTools: '../../../packages/gateway/src/tools/skill-tools.ts',
  reusedProviderUsage: '../../../packages/gateway/src/services/provider-usage.ts',
  reusedPullRequestRoutes: '../../../packages/gateway/src/routes/pull-requests.ts',
  reusedEmailRoutes: '../../../packages/gateway/src/routes/email.ts',
  reusedQuotaFetchers: '../../../packages/gateway/src/services/provider-quota-fetchers.ts',
  reusedModelFetchers: '../../../packages/gateway/src/providers/model-fetchers.ts',
  reusedAcpRegistry: '../../../packages/gateway/src/providers/acp-registry.ts',
  reusedComputerTools: '../../../packages/gateway/src/tools/computer-tools.ts',
  reusedEmailTools: '../../../packages/gateway/src/tools/email-tools.ts',
  reusedFileTools: '../../../packages/gateway/src/tools/file-tools.ts',
  homeassistant: '../../../packages/gateway/src/tools/homeassistant-tools.ts',
  reusedTeamChatRoutes: '../../../packages/gateway/src/routes/team-chat.ts',
  reusedChannelTools: '../../../packages/gateway/src/tools/channel-tools.ts',
  reusedMemoryTools: '../../../packages/gateway/src/tools/memory-tools.ts',
  reusedRemoteExecutor: '../../../packages/gateway/src/tools/remote-executor.ts',
  reusedScreenShareTools: '../../../packages/gateway/src/tools/screen-share-tools.ts',
  reusedConsentExecutor: '../../../packages/gateway/src/security/consent-executor.ts',
  reusedSystemOne: '../../../packages/gateway/src/services/system-one.ts',
  reusedPreviewRoutes: '../../../packages/gateway/src/routes/preview.ts',
  reusedWhatsApp: '../../../packages/gateway/src/channels/whatsapp/connector.ts',
  reusedProviderAccounts: '../../../packages/gateway/src/services/provider-accounts.ts',
  reusedReminders: '../../../packages/gateway/src/services/reminders.ts',
  reusedSandboxTools: '../../../packages/gateway/src/tools/sandbox-tools.ts',
  reusedOsTools: '../../../packages/gateway/src/tools/os-tools.ts',
  reusedVoiceService: '../../../packages/gateway/src/voice/service.ts',
  reusedProjectWatcher: '../../../packages/gateway/src/services/project-watcher.ts',
  reusedChannelAssistant: '../../../packages/gateway/src/channels/assistant.ts',
  reusedQuestions: '../../../packages/gateway/src/services/user-questions.ts',
  reusedQuestionTool: '../../../packages/gateway/src/tools/user-question-tools.ts',

  agentControl: '../../../packages/gateway/src/services/agent-control.ts',
  attention: '../../../packages/gateway/src/services/attention.ts',
  mobilePush: '../../../packages/gateway/src/services/mobile-push.ts',
  permissions: '../../../packages/gateway/src/security/tool-permissions.ts',
  profiles: '../../../packages/gateway/src/security/tool-profiles.ts',
  reusedSkillInstall: '../../../packages/gateway/src/skills/install.ts',
  reusedRepoTodos: '../../../packages/gateway/src/tools/repo-proposal-tools.ts',

  desktopEntry: '../../../packages/gateway/bin/desktop-host.mjs',
  ptyEntry: '../../../packages/gateway/src/pty-broker.mjs',
  config: '../../../packages/gateway/src/config.ts',
  safeUpdate: '../../../packages/gateway/bin/safe-update.mjs',
  gmail: '../../../packages/gateway/src/services/email/gmail.ts',
  outlook: '../../../packages/gateway/src/services/email/outlook.ts',
  imap: '../../../packages/gateway/src/services/email/imap.ts',

  jaitModels: '../../../packages/gateway/src/services/jait-models.ts',
  liveView: '../../../packages/gateway/src/services/live-view-manager.ts',
  metaTools: '../../../packages/gateway/src/tools/meta-tools.ts',
  ptyClient: '../../../packages/gateway/src/pty-broker-client.ts',

  mailConnection: '../../../packages/gateway/src/services/email/connection.ts',
  graphrag: '../../../packages/gateway/src/services/code-graph/graphrag-adapter.ts',
  graphTools: '../../../packages/gateway/src/tools/code-graph-tools.ts',
  graphRoutes: '../../../packages/gateway/src/routes/code-graph.ts',
  ollamaDevice: '../../../packages/gateway/src/services/ollama-device-auth.ts',
  providerUpdates: '../../../packages/gateway/src/services/provider-updates.ts',

  evalGateway: '../../../packages/gateway/src/evaluation/isolated-gateway.ts',
  evalChild: '../../../packages/gateway/src/evaluation/isolated-gateway-child.ts',
  sandboxProcess: '../../../packages/gateway/src/security/sandbox-background-process.ts',
  goFetch: '../../../packages/gateway/src/services/opencode-go-fetch.ts',

  piProvision: '../../../packages/gateway/src/providers/pi-mcp-provision.ts',

  catalogTool: '../../../packages/gateway/src/tools/catalog-tools.ts',
  networkTool: '../../../packages/gateway/src/tools/network-tools.ts',

  workbenchTools: '../../../packages/gateway/src/tools/security-workbench-tools.ts',

  messengerHistory: '../../../packages/gateway/src/services/messenger-history.ts',

  protocols: '../../../packages/gateway/src/lib/security/protocols.ts',

  channelRoutes: '../../../packages/gateway/src/routes/channels.ts',
  storeRoutes: '../../../packages/gateway/src/routes/store.ts',
  filesystemRoutes: '../../../packages/gateway/src/routes/filesystem.ts',

  fsSelection: '../../../packages/gateway/src/tools/core/get-fs.ts',
  coreSearch: '../../../packages/gateway/src/tools/core/search.ts',

  shellAssets: '../../../packages/gateway/src/surfaces/shell-integration-assets.ts',
  executeWrapper: '../../../packages/gateway/src/tools/core/execute.ts',
  securityTools: '../../../packages/gateway/src/tools/security-tools.ts',
  teamChatTool: '../../../packages/gateway/src/tools/team-chat-tools.ts',
  personaTool: '../../../packages/gateway/src/tools/persona-agent-tools.ts',

  validator: '../../../packages/gateway/src/tools/validate.ts',
  subagentPersistence: '../../../packages/gateway/src/lib/sub-agent-persistence.ts',
  coreEdit: '../../../packages/gateway/src/tools/core/edit.ts',
  coreRead: '../../../packages/gateway/src/tools/core/read.ts',
  coreWeb: '../../../packages/gateway/src/tools/core/web.ts',
  threadTitle: '../../../packages/gateway/src/services/thread-title.ts',

  assessmentRoutes: '../../../packages/gateway/src/routes/security-assessments.ts',
  workbenchRoutes: '../../../packages/gateway/src/routes/security-workbench.ts',
  environmentRoutes: '../../../packages/gateway/src/routes/environment.ts',
  packageDesktopScript: '../../../packages/gateway/scripts/package-desktop.mjs',
  graphifyRunner: '../../../packages/gateway/src/services/code-graph/graphify-runner.ts',
  copyShellScript: '../../../packages/gateway/scripts/copy-shell-integration.mjs',
  embedShellScript: '../../../packages/gateway/scripts/embed-shell-integration.mjs',
  updateFailure: '../../../packages/gateway/src/routes/update-failure.ts',
  sandboxBackground: '../../../packages/gateway/src/tools/sandbox-background-terminal.ts',

  skillRoutes: '../../../packages/gateway/src/routes/skills.ts',
  skillDiscovery: '../../../packages/gateway/src/tools/skill-discovery-tools.ts',
  remoteImages: '../../../packages/gateway/src/services/email/remote-images.ts',
  subscriptionFetchers: '../../../packages/gateway/src/services/subscription-usage-fetchers.ts',
  messengerBridge: '../../../packages/gateway/src/services/messenger-bridge.ts',
  maintenanceRoutes: '../../../packages/gateway/src/routes/maintenance.ts',
  screenShareRoutes: '../../../packages/gateway/src/routes/screen-share.ts',
  pluginRoutes: '../../../packages/gateway/src/routes/plugins.ts',
  agentControlRoutes: '../../../packages/gateway/src/routes/agent-control.ts',
  smokeProcess: '../../../packages/gateway/scripts/smoke-process.mjs',
  surfaceTools: '../../../packages/gateway/src/tools/surface-tools.ts',
  osResolver: '../../../packages/gateway/src/os-control/resolver.ts',
  installRuntimeScript: '../../../packages/gateway/bin/install-runtime.mjs',
  bundleMessengerScript: '../../../packages/gateway/scripts/bundle-messenger-runtime.mjs',
  bundleWebScript: '../../../packages/gateway/scripts/bundle-web.mjs',
  compileCacheScript: '../../../packages/gateway/bin/compile-cache.mjs',
  sqlTool: '../../../packages/gateway/src/tools/session-sql-tools.ts',
  cronTools: '../../../packages/gateway/src/tools/cron-tools.ts',
  decisionTool: '../../../packages/gateway/src/tools/decision.ts',
  agentWrapper: '../../../packages/gateway/src/tools/core/agent.ts',
  pluginSdk: '../../../packages/gateway/src/plugins/contracts.ts',
  foundationBarrel: '../../../packages/gateway/src/foundation.ts',
  ollamaSetup: '../../../packages/gateway/src/services/ollama-usage-setup.ts',
  maintenanceTool: '../../../packages/gateway/src/tools/maintenance-tools.ts',
  networkResources: '../../../packages/gateway/src/services/network-resources.ts',
  nodeState: '../../../packages/gateway/src/services/node-state-manager.ts',
  transfer: '../../../packages/gateway/src/services/project-transfer.ts',
  notification: '../../../packages/gateway/src/services/chat-notification.ts',
  messenger: '../../../packages/gateway/src/tools/messenger-tools.ts',
  matrixBarrel: '../../../packages/gateway/src/services/messenger-matrix-runtime.ts',
  mcpConfig: '../../../packages/gateway/src/providers/jait-mcp.ts',
  usageCache: '../../../packages/gateway/src/services/usage-refresh-cache.ts',
  link: '../../../packages/gateway/src/tools/link-tools.ts',
  ownerRuntime: '../../../packages/gateway/src/security/agent-sandbox-owner.ts',
  mount: '../../../packages/gateway/src/security/worktree-sandbox.ts',
  mobile: '../../../packages/gateway/src/tools/mobile-tools.ts',
  diagram: '../../../packages/gateway/src/tools/diagram-tools.ts',
  output: '../../../packages/gateway/src/surfaces/terminal-output.ts',
  emailBarrel: '../../../packages/gateway/src/services/email/index.ts',
  calendarBarrel: '../../../packages/gateway/src/services/calendar/index.ts',
  dbBarrel: '../../../packages/gateway/src/db/index.ts',
  providerBarrel: '../../../packages/gateway/src/providers/index.ts',
  osBarrel: '../../../packages/gateway/src/os-control/index.ts',
  surfaceBarrel: '../../../packages/gateway/src/surfaces/index.ts',
  securityBarrel: '../../../packages/gateway/src/security/index.ts',
  coreBarrel: '../../../packages/gateway/src/tools/core/index.ts',
  voice: '../../../packages/gateway/src/tools/voice-tools.ts',
  editor: '../../../packages/gateway/src/tools/project-editor-tools.ts',
  lists: '../../../packages/gateway/src/tools/list-preview.ts',
  swarm: '../../../packages/gateway/src/tools/swarm-mailbox.ts',
  control: '../../../packages/gateway/src/security/control-access.ts',
  trust: '../../../packages/gateway/src/routes/trust.ts',
  hooks: '../../../packages/gateway/src/routes/hooks.ts',
  surface: '../../../packages/gateway/src/surfaces/project-ui-sync.ts',
  lease: '../../../packages/gateway/src/security/assessment-lease.ts',
  ownership: '../../../packages/gateway/src/security/ownership.ts',
  state: '../../../packages/gateway/src/state-directory.ts',
  crypto: '../../../packages/gateway/src/crypto-polyfill.ts',
  inline: '../../../packages/gateway/src/services/email/inline-images.ts',
  preview: '../../../packages/gateway/src/security/preview-token.ts',
  origin: '../../../packages/gateway/src/security/request-origin.ts',
  git: '../../../packages/gateway/src/routes/git-node-routing.ts',
  shell: '../../../packages/gateway/src/tools/shell-prompt.ts',
  headers: '../../../packages/gateway/src/services/llm-headers.ts',
  cron: '../../../packages/gateway/src/scheduler/cron.ts',
  devices: '../../../packages/gateway/src/services/device-registry.ts',
  uuid: '../../../packages/gateway/src/lib/uuidv7.ts',
  dbuuid: '../../../packages/gateway/src/db/uuidv7.ts',
  apiTypes: '../../../packages/gateway/src/api-contracts.ts',
  channelTypes: '../../../packages/gateway/src/channels/types.ts',
  memoryTypes: '../../../packages/gateway/src/memory/contracts.ts',
  osTypes: '../../../packages/gateway/src/os-control/types.ts',
  providerTypes: '../../../packages/gateway/src/providers/contracts.ts',
  schedulerTypes: '../../../packages/gateway/src/scheduler/contracts.ts',
  securityTypes: '../../../packages/gateway/src/security/contracts.ts',
  calendarTypes: '../../../packages/gateway/src/services/calendar/types.ts',
  emailTypes: '../../../packages/gateway/src/services/email/types.ts',
  sessionTypes: '../../../packages/gateway/src/sessions/contracts.ts',
  surfaceTypes: '../../../packages/gateway/src/surfaces/contracts.ts',
  toolTypes: '../../../packages/gateway/src/tools/contracts.ts',
  skills: '../../../packages/gateway/src/skills/index.ts',
  modelResult: '../../../packages/gateway/src/tools/model-result.ts',
  usage: '../../../packages/gateway/src/providers/usage.ts',
};

export async function dispatch(call: any): Promise<unknown> {
  const specifier = sources[call.module];
  if (!specifier) throw new Error('unreviewed source');
  if (call.op === 'sourcereview.clawhubClient') {
    const subject = await import(specifier);
    const previous = globalThis.fetch;
    const requests: unknown[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({url:String(url),headers:init?.headers});
      if (call.reject) throw new Error('synthetic offline');
      return new Response(call.raw ?? (call.action === 'download' ? 'zip-bytes' : JSON.stringify(call.body ?? {})), {status:call.status ?? 200,statusText:call.statusText ?? 'OK'});
    }) as typeof fetch;
    try {
      const client = new subject.ClawHubClient(call.registry);
      let result: unknown;
      try {
        if (call.action === 'search') result = await client.searchSkills(call.query,call.limit);
        else if (call.action === 'list') result = await client.listSkills(call.options);
        else if (call.action === 'detail') result = await client.getSkill(call.slug);
        else if (call.action === 'download') result = Array.from(new Uint8Array(await client.downloadSkill(call.slug,call.version)));
        else result = await client.listPackages(call.options);
      } catch(error) { result={error:(error as Error).message}; }
      return {result,requests};
    } finally { globalThis.fetch=previous; }
  }
  if (call.op === 'sourcereview.messengerRoutes') {
    const {mock}=await import('bun:test');
    const requests: unknown[]=[];const hooks: unknown[]=[];
    const record=(name:string,...args:unknown[])=>{requests.push([name,...args]);if(call.fail===name)throw new Error('private-matrix-token');};
    class FakeMessenger {
      constructor(secret:string){record('construct',secret);}
      restore(){record('restore');}
      async stop(){record('stop');}
      async resume(owner:string){record('resume',owner);}
      snapshot(owner:string,room?:string|null){record('snapshot',owner,room??null);return{owner,room:room??null};}
      async connect(owner:string,input:unknown){record('connect',owner,input);}
      async disconnect(owner:string){record('disconnect',owner);}
      async search(owner:string,query:string){record('search',owner,query);return['matched'];}
      async restoreKeys(owner:string,key:string){record('restoreKeys',owner,key);}
      async media(owner:string,url:string,file?:unknown){record('media',owner,url,file??null);return Buffer.from('fixture');}
      async command(owner:string,input:unknown){record('command',owner,input);return{eventId:'event-1'};}
      async assistant(owner:string,input:unknown){record('assistant',owner,input);return{ok:true};}
    }
    mock.module(new URL('packages/gateway/src/services/messenger-service.ts',new URL('../../../', import.meta.url)).href,()=>({MessengerService:FakeMessenger,messengerHomeserver:(value:string)=>{const url=new URL(value);if(url.protocol!=='https:')throw new Error('invalid');return url.origin;}}));
    let app:any;
    try {
      const subject=await import(specifier);
      const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');app=Fastify();
      subject.registerMessengerRoutes(app,{jwtSecret:'messenger-fixture-secret'},{setGatewayHandler:(handler:unknown)=>hooks.push(typeof handler)});
      const {signAuthToken}=await import(new URL('packages/gateway/src/security/http-auth.ts',new URL('../../../', import.meta.url)).href);
      const headers=call.auth===false?{}:{authorization:'Bearer '+await signAuthToken({id:call.owner??'owner',username:'fixture'},'messenger-fixture-secret')};
      const response=await app.inject({method:call.method??'GET',url:call.url??'/api/messenger',headers,payload:call.body});
      const result={status:response.statusCode,body:response.json(),cache:response.headers['cache-control']??null};
      await app.close();app=null;
      return{...result,requests,hooks};
    }finally{if(app)await app.close();mock.restore();}
  }

  if (call.op === 'sourcereview.assessmentRuntime') {
    const { assessmentReview } = await import('./source-review-assessment.ts');
    return assessmentReview(await import(specifier), call);
  }
  if (call.op === 'sourcereview.erased') {
    const { default: ts } = await import('typescript');
    const source = readFileSync(new URL(specifier, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText.trim();
    return { emitted: output, exports: Object.keys(await import(specifier)).sort() };
  }
  if (call.op === 'sourcereview.validateInput') {
    const subject = await import(specifier);
    const input = structuredClone(call.input);
    return { ...subject.validateToolInput(call.schema, input), input };
  }
  if (call.op === 'sourcereview.subagentPersistence') {
    const subject = await import(specifier);
    const raw = call.raw !== undefined ? call.raw : JSON.stringify(call.payload);
    if (call.action === 'extract') return subject.extractSubAgentPayloads(raw);
    if (call.action === 'strip') return subject.stripSubAgentPayloads(raw) ?? null;
    const attempts: unknown[] = [], writes: unknown[] = [];
    const db: any = {};
    // Capture the actual schema column identity independently of the subject.
    const { subAgentHistory } = await import(new URL('packages/gateway/src/db/schema.ts', new URL('../../../', import.meta.url)).href);
    db.insert = (_table: unknown) => { let row: any, conflict: any; return {
      values(value: unknown) { row = value; return this; }, onConflictDoUpdate(value: unknown) { conflict = value; return this; },
      run() { attempts.push(row.subAgentId); if (row.subAgentId === call.failId) throw new Error('fixture write failed'); const {createdAt,...values}=row;
        writes.push({values,timestamp:/^\d{4}-\d\d-\d\dT/.test(createdAt),targetIdentity:conflict.target===subAgentHistory.subAgentId,update:conflict.set}); }
    }; };
    subject.persistSubAgentHistories(db, 'session-fixture', 'message-fixture', raw);
    return { attempts, writes };
  }
  if (call.op === 'sourcereview.coreFile') {
    const {mock}=await import('bun:test'); const calls: unknown[]=[]; const context={sessionId:'file-fixture',projectRoot:'/fixture'}; const registry={fixture:true};
    mock.module(new URL('packages/gateway/src/tools/core/get-fs.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      async getFs(r: unknown,c: unknown,path: unknown){calls.push(['getFs',r===registry,c===context,path]);if(call.fail==='resolve')throw new Error('fixture resolution failed');return {
        async statFile(path: unknown){calls.push(['stat',path]);if(call.fail==='stat')throw new Error('fixture stat failed');return {isDirectory:!!call.directory};},
        async list(path: unknown){calls.push(['list',path]);return call.entries??[];},
        async read(path: unknown){calls.push(['read',path]);if(call.fail==='read')throw call.nonError?'failure':new Error('fixture read failed');return call.repeat?call.repeat.text.repeat(call.repeat.count)+(call.repeat.suffix??''):call.content;},
        async write(...args: unknown[]){calls.push(['write',...args]);if(call.fail==='write')throw call.nonError?'failure':new Error('fixture write failed');},
        async patch(...args: unknown[]){calls.push(['patch',...args]);if(call.fail==='patch')throw new Error('fixture patch failed');return {matched:call.matched??true};}
      };}
    }));
    try{const subject=await import(specifier);const tool=subject[call.module==='coreRead'?'createReadTool':'createEditTool'](registry); const result=await tool.execute(call.input,context);
      if(call.compact&&result.data?.content!==undefined){const text=result.data.content;result.data.content={length:text.length,first:text.slice(0,12),last:text.slice(-Math.min(180,text.length))};}
      return {result,calls};
    }finally{mock.restore();}
  }
  if (call.op === 'sourcereview.coreWeb') {
    const {mock}=await import('bun:test'); const calls: unknown[]=[]; const context={sessionId:'web-fixture'};
    mock.module(new URL('packages/gateway/src/tools/browser-tools.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      createWebSearchTool(){return {async execute(input: any,c: unknown){calls.push(['search',input,c===context]);if(call.rejectSearch)throw new Error('fixture search failed');return {ok:true,message:'search result',data:{query:input.query}};}};},
      createWebFetchTool(){return {async execute(input: any,c: unknown){calls.push(['fetch',input,c===context]);if((call.rejectUrls??[]).includes(input.url))throw new Error('fixture fetch failed');return {ok:!(call.failedUrls??[]).includes(input.url),message:'fetch result',data:{body:'fixture'}};}};}
    }));
    try{const subject=await import(specifier);try{return {result:await subject.createWebTool().execute(call.input,context),calls};}catch(error){return {error:(error as Error).message,calls};}}
    finally{mock.restore();}
  }
  if (call.op === 'sourcereview.threadTitle') {
    const {mock}=await import('bun:test'); const calls:unknown[]=[];
    mock.module(new URL('packages/gateway/src/services/jait-llm.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      resolveJaitLlmConfig(input: unknown){calls.push(['resolve',input]);return call.llm??{backend:'fixture',openaiApiKey:'fixture-key'};},
      async callJaitLlmCompletion(...args: unknown[]){calls.push(['completion',...args]);if(call.fail)throw new Error('fixture completion failed');return call.raw;}
    }));
    const oldFetch=globalThis.fetch,oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
    const timers=new Map<number,()=>void>(); let counter=0;
    globalThis.fetch=(async (url: unknown,options: any)=>{calls.push(['fetch',url,{...options,body:JSON.parse(options.body)}]);return {ok:call.status===undefined||call.status===200,status:call.status??200,json:async()=>call.response};}) as unknown as typeof fetch;
    globalThis.setTimeout=((fn:()=>void,ms:number)=>{const id=++counter;calls.push(['timer',ms]);timers.set(id,fn);return id;}) as unknown as typeof setTimeout;
    globalThis.clearTimeout=((id:number)=>{calls.push(['clear',id]);timers.delete(id);}) as unknown as typeof clearTimeout;
    try{const subject=await import(specifier);
      if(call.action==='normalize')return subject.normalizeGeneratedThreadTitle(call.raw,call.fallback??'fallback');
      if(call.action==='api'){try{return {result:await subject.generateTitleViaApi({task:'  fixture task  ',config:{llmProvider:'ollama',openaiApiKey:'config-key',openaiBaseUrl:'https://fixture.invalid///',openaiModel:'config-model',ollamaUrl:'http://ollama.invalid///',ollamaModel:'ollama-model',...call.config},apiKeys:call.keys,model:call.model,jaitBackend:call.backend}),calls};}catch(error){return {error:(error as Error).message,calls};}}
      let listener:(event:unknown)=>void=()=>{}; let unsubs=0;
      const provider={onEvent(fn:(event:unknown)=>void){listener=fn;return ()=>{unsubs++;};},async sendTurn(sessionId:unknown,prompt:unknown){calls.push(['turn',sessionId,prompt]);if(call.fail)throw new Error('fixture turn failed');for(const event of call.events??[])listener(event);}};
      const pending=subject.generateTitleViaTurn(provider,'title-session','  fixture task  ');
      if(call.timeout)for(const [id,timer] of timers){timers.delete(id);timer();}
      try{return {result:await pending,calls,unsubs,pendingTimers:timers.size};}catch(error){return {error:(error as Error).message,calls,unsubs,pendingTimers:timers.size};}
    }finally{mock.restore();globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
  }

  if (call.op === 'sourcereview.shellAssets') {
    const {createHash}=await import('node:crypto');const subject=await import(specifier);
    const hashes=Object.fromEntries(Object.entries(subject.SHELL_INTEGRATION_ASSETS).map(([name,bytes])=>[name,createHash('sha256').update(bytes as string).digest('hex')]));
    return {exports:Object.keys(subject).sort(),hashes,identity:subject.SHELL_INTEGRATION_ASSETS['bash.sh']===subject.BASH_INTEGRATION_SCRIPT&&subject.SHELL_INTEGRATION_ASSETS['zsh.sh']===subject.ZSH_INTEGRATION_SCRIPT&&subject.SHELL_INTEGRATION_ASSETS['pwsh.ps1']===subject.PWSH_INTEGRATION_SCRIPT};
  }
  if (call.op === 'sourcereview.executeWrapper') {
    const {mock}=await import('bun:test');const registry={},secret={},ws={},env=()=>({}),context={sessionId:'execute-fixture'},calls:unknown[]=[]; const result={ok:true,message:'inner terminal result'};
    mock.module(new URL('packages/gateway/src/tools/terminal-tools.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      createTerminalRunTool(...args:unknown[]){calls.push(['factory',args[0]===registry,args[1]===undefined,args[2]===ws,args[3]===secret,args[4]===env]);return {async execute(input:unknown,c:unknown){calls.push(['execute',input,c===context]);if(call.fail)throw new Error('fixture terminal rejected');return result;}};}
    }));
    try{const subject=await import(specifier),tool=subject.createExecuteTool(registry,secret,ws,env);try{const received=await tool.execute(call.input,context);return {name:tool.name,required:tool.parameters.required,resultIdentity:received===result,result:received,calls};}catch(error){return {error:(error as Error).message,calls};}}finally{mock.restore();}
  }
  if (call.op === 'sourcereview.securityTools') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const signal=new AbortController().signal;
    const run={id:'run-fixture',scopeId:'scope-fixture',startedAt:'time-start',completedAt:'time-end',status:call.status??'completed',scope:{vantagePoint:'gateway',profile:'tcp'},engine:'fixture',engineVersion:'1',plannedChecks:4,observations:[{state:'open'},{state:'closed'},{state:'timeout'},{state:'error'}],coverageGaps:['fixture gap']};
    const svc={createScope(input:unknown,operator:unknown,projectRoot:unknown){calls.push(['create',input,operator,projectRoot]);if(call.fail)throw call.nonError?'failure':new Error('fixture scope failed');return {id:'scope-fixture'};},
      start(id:unknown,operator:unknown,node:unknown,s:unknown){calls.push(['start',id,operator,node,s===signal]);if(call.fail)throw new Error('fixture start failed');return run;},
      async wait(id:unknown,operator:unknown){calls.push(['wait',id,operator]);return run;},history(operator:unknown){calls.push(['history',operator]);return {scopes:Array.from({length:12},(_,i)=>({id:`s${i}`})),runs:Array.from({length:12},()=>run)};},
      getRun(id:unknown,operator:unknown){calls.push(['get',id,operator]);if(call.fail)throw new Error('fixture get failed');return run;},cancel(id:unknown,operator:unknown){calls.push(['cancel',id,operator]);if(call.fail)throw new Error('fixture cancel failed');}};
    mock.module(new URL('packages/gateway/src/security/assessment.ts',new URL('../../../', import.meta.url)).pathname,()=>({getAssessmentService:()=>svc}));
    try{const subject=await import(specifier),tools=subject.createSecurityTools();if(call.action==='metadata')return tools.map((t:any)=>({name:t.name,risk:t.risk??null,consent:t.defaultConsentLevel??null,required:t.parameters.required??[]}));
      const tool=tools.find((t:any)=>t.name===call.name);const result=await tool.execute(call.input??{}, {requestedBy:'mcp-client',projectRoot:'/fixture',signal,...call.context});return {result,calls};
    }finally{mock.restore();}
  }
  if (call.op === 'sourcereview.teamChatTool') {
    const subject=await import(specifier);const calls:unknown[]=[];const room={id:'room-fixture',name:'Fixture room',rootAgentId:'lead-fixture'};const sender={kind:call.senderKind??'chat',id:'sender-fixture'};
    const record=(name:string,...args:unknown[])=>{calls.push([name,...args]);if(call.fail===name)throw call.nonError?'failure':new Error('fixture '+name+' failed');};
    const service={list(...args:unknown[]){record('list',...args);return [room];},workForSession(...args:unknown[]){record('work',...args);return call.work??null;},ensureRoom(...args:unknown[]){record('ensure',...args);return room;},get(...args:unknown[]){record('get',...args);return room;},roomMembers(...args:unknown[]){record('members',...args);return [{id:'member'}];},history(...args:unknown[]){record('history',...args);return [{id:'history'}];},deliveries(...args:unknown[]){record('deliveries',...args);return [{messageId:'message-fixture',id:'d1'},{messageId:'other',id:'d2'}];},sender(...args:unknown[]){record('sender',...args);return sender;},setGoal(...args:unknown[]){record('goal',...args);return room;},completeGoal(...args:unknown[]){record('complete',...args);return room;},async postRouted(...args:unknown[]){record('post',...args);return {id:'message-fixture'};},threadById(...args:unknown[]){record('thread',...args);return call.thread?{id:'thread-fixture'}:null;}};
    const tool=subject.createTeamChatTool(service,{});const result=await tool.execute(call.input,{sessionId:'session-fixture',userId:'user-fixture',actionId:'action-fixture',...call.context});return {result,calls};
  }
  if (call.op === 'sourcereview.personaTool') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];
    mock.module(new URL('packages/gateway/src/db/uuidv7.ts',new URL('../../../', import.meta.url)).pathname,()=>({uuidv7:()=> 'generated-profile'}));
    const service={listPersonaAgents(...args:unknown[]){calls.push(['list',...args]);return call.existing?[call.existing]:[];},getPersonaAgent(...args:unknown[]){calls.push(['get',...args]);return call.existing??null;},deletePersonaAgent(...args:unknown[]){calls.push(['delete',...args]);},savePersonaAgent(...args:any[]){calls.push(['save',...args]);if(call.fail)throw call.nonError?'failure':new Error('fixture save failed');return args[1];}};
    try{const subject=await import(specifier),deps={threadService:service,providerAvailable(...args:unknown[]){calls.push(['provider',...args]);return call.available??true;}};
      const tool=subject[call.inspect?'createPersonaAgentInspectTool':'createPersonaAgentTool'](deps);const result=await tool.execute(call.input,{userId:'user-fixture',...call.context});
      if(result.message.startsWith('Invalid agent profile: '))result.message='Invalid agent profile';return {result,calls};
    }finally{mock.restore();}
  }

  if (call.op === 'sourcereview.fsSelection' || call.op === 'sourcereview.searchWrapper') {
    const {mock}=await import('bun:test');const fs=await import('node:fs');
    const base=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;fs.mkdirSync(base,{recursive:true});const fixture=fs.mkdtempSync(join(base,'filesystem-'));fs.mkdirSync(join(fixture,'project/src'),{recursive:true});fs.mkdirSync(join(fixture,'outside'),{recursive:true});fs.writeFileSync(join(fixture,'outside/file.txt'),'fixture');fs.writeFileSync(join(fixture,'project/file.txt'),'fixture');
    const expand=(value:any):any=>typeof value==='string'?value.replaceAll('$FIXTURE',fixture):Array.isArray(value)?value.map(expand):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,expand(item)])):value;
    const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(fixture,'$FIXTURE'));
    const starts:unknown[]=[];let created:unknown;
    class Local {id:string;state:string;root:string;allow:boolean;throws:boolean;constructor(s:any){this.id=s.id;this.state=s.state??'running';this.root=s.root;this.allow=s.allow??false;this.throws=s.throws??false;}snapshot(){return {metadata:{projectRoot:this.root}};}isPathAllowed(path:string){if(this.throws)throw new Error('fixture path check failed');return this.allow&&(path===this.root||path.startsWith(this.root+'/'));}}
    class Remote extends Local {}
    const surfaces=(expand(call.surfaces)??[]).map((s:any)=>s.remote?new Remote(s):new Local(s));
    const registry={getBySession:()=>surfaces,getSurface:(id:string)=>surfaces.find((s:any)=>s.id===id),async startSurface(type:unknown,id:string,options:unknown){starts.push({type,idKind:id==='fs-session'?'conventional':'scoped',options});created=new Local({id,root:(options as any).projectRoot});return created;}};
    const context={sessionId:'session',projectRoot:expand(call.projectRoot??'$FIXTURE/project')};
    if(call.op==='sourcereview.fsSelection'){
      mock.module(new URL('packages/gateway/src/surfaces/filesystem.ts',new URL('../../../', import.meta.url)).pathname,()=>({FileSystemSurface:Local}));
      mock.module(new URL('packages/gateway/src/surfaces/remote-filesystem.ts',new URL('../../../', import.meta.url)).pathname,()=>({RemoteFileSystemSurface:Remote}));
      try{const subject=await import(specifier);
        if(call.action==='root')return subject.resolveProjectRoot(registry,'session',call.fallback)===process.cwd()?'$CWD':normalize(subject.resolveProjectRoot(registry,'session',call.fallback));
        if(call.action==='localPath')return subject.isGatewayLocalPathOutsideProject(expand(call.target),expand(call.projectRoot));
        try{const result=await subject.getFs(registry,context,expand(call.target));return normalize({selected:result===created?'created':result.id,starts});}catch(error){return normalize({error:(error as Error).message,starts});}
      }finally{mock.restore();fs.rmSync(fixture,{recursive:true,force:true});}
    }
    const calls:unknown[]=[];let index=0;const runtime={fixture:true};
    class Unavailable extends Error {constructor(public reason:string,message:string){super(message);}}
    mock.module(new URL('packages/gateway/src/tools/core/get-fs.ts',new URL('../../../', import.meta.url)).pathname,()=>({resolveProjectRoot(r:unknown,id:unknown,fallback:unknown){calls.push(['root',r===registry,id,fallback]);return context.projectRoot;}}));
    mock.module(new URL('packages/gateway/src/services/project-search.ts',new URL('../../../', import.meta.url)).pathname,()=>({PROJECT_SEARCH_DEFAULT_RESULTS:20,PROJECT_SEARCH_MAX_RESULTS:200,ProjectSearchUnavailableError:Unavailable,
      normalizeProjectSearchLimit(value:unknown){calls.push(['limit',value??null]);return call.normalizedLimit??20;},async searchProject(input:unknown,r:unknown){calls.push(['search',input,r===runtime]);const result=call.responses[index++]??call.responses.at(-1);if(result.error)throw result.unavailable?new Unavailable(result.reason,result.error):result.nonError?'failure':new Error(result.error);return result;}}));
    try{const subject=await import(specifier),tool=subject.createSearchTool(registry,runtime);return normalize({result:await tool.execute(call.input,context),calls});}
    finally{mock.restore();fs.rmSync(fixture,{recursive:true,force:true});}
  }

  if (call.op === 'sourcereview.channelRoutes') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];let current={enabled:true,allowedSenders:['owner'],token:'fixture-token',...call.config};
    mock.module(new URL('packages/gateway/src/channels/telegram/connector.ts',new URL('../../../', import.meta.url)).pathname,()=>({extractBotToken(value:unknown){calls.push(['extract',value]);return call.extracted??null;}}));
    const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');const app=Fastify({logger:false});const secret='fixture-channels-secret';const auth=await import(new URL('packages/gateway/src/security/http-auth.ts',new URL('../../../', import.meta.url)).href);const token=await auth.signAuthToken({id:'user',username:'fixture'},secret);
    const detail=call.detail??{},managed={connector:{id:'telegram',currentQr:()=> 'fallback-qr'},status:'connected',detail};
    const record=(name:string,...args:unknown[])=>{calls.push([name,...args]);if(call.fail===name)throw call.nonError?'failure':new Error('fixture '+name+' failed');};
    const manager={list(){record('list');return [{id:'telegram',status:'connected',config:current}];},get(id:unknown){record('get',id);return call.missing?undefined:managed;},getConfig(id:unknown){record('config',id);return current;},setConfig(id:unknown,patch:unknown){record('set',id,patch);current={...current,...patch as object};return current;},async setupGuide(id:unknown){record('guide',id);return call.noGuide?null:{title:'Fixture guide'};},async start(...args:unknown[]){record('start',...args);},async stop(...args:unknown[]){record('stop',...args);},async pair(...args:unknown[]){record('pair',...args);}};
    try{const subject=await import(specifier);subject.registerChannelRoutes(app,{jwtSecret:secret},manager);await app.ready();const responses=[];
      for(const request of call.requests){const response=await app.inject({...request,headers:call.auth===false?{}:{authorization:'Bearer '+token}});responses.push({status:response.statusCode,body:response.json()});}return {responses,calls};
    }finally{await app.close();mock.restore();}
  }
  if (call.op === 'sourcereview.storeRoutes') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const clawhub={async searchSkills(...args:unknown[]){calls.push(['search',...args]);return call.results??[];},async getSkill(slug:unknown){calls.push(['detail',slug]);if(call.fail==='detail')throw new Error('fixture detail failed');if(call.timeout)return new Promise(()=>{});return call.details?.[String(slug)]??{};},async listPackages(input:unknown){calls.push(['packages',input]);return [{id:'package'}];}};
    const registry={list:()=> (call.installed??[]).map((id:string)=>({id})),get:(id:string)=>(call.installed??[]).includes(id)?{id}:undefined};
    mock.module(new URL('packages/gateway/src/skills/install.ts',new URL('../../../', import.meta.url)).pathname,()=>({async installClawHubSkill(input:any){calls.push(['install',input.clawhub===clawhub,input.skillRegistry===registry,input.slug,input.version??null]);if(call.fail==='install')throw call.nonError?'fixture install failure':new Error('fixture install failed');return {id:input.slug};},async uninstallClawHubSkill(input:any){calls.push(['uninstall',input.skillRegistry===registry,input.slug]);if(call.fail==='uninstall')throw new Error(call.protected?'not a ClawHub-installed skill':'fixture uninstall failed');}}));
    const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');const app=Fastify({logger:false});const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;const timers:Array<()=>void>=[];
    globalThis.setTimeout=((fn:()=>void,ms:number,...args:unknown[])=>{if(ms===3000&&call.timeout){queueMicrotask(fn);return 0;}const timer=oldTimeout(fn,ms,...args);if(ms===3000)timers.push(()=>oldClear(timer));return timer;}) as typeof setTimeout;
    try{const subject=await import(specifier);subject.registerStoreRoutes(app,{clawhub,skillRegistry:registry});await app.ready();const responses=[];for(const request of call.requests){const response=await app.inject(request);responses.push({status:response.statusCode,body:response.json()});}return {responses,calls};}
    finally{await app.close();mock.restore();globalThis.setTimeout=oldTimeout;for(const clear of timers)clear();}
  }
  if (call.op === 'sourcereview.filesystemRoutes') {
    const fs=await import('node:fs');const os=await import('node:os');const base=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;fs.mkdirSync(base,{recursive:true});const fixture=fs.mkdtempSync(join(base,'browse-'));for(const dir of ['z-dir','a-dir','.hidden-dir'])fs.mkdirSync(join(fixture,dir));for(const file of ['b.txt','a.txt','.hidden','$RECYCLE.BIN','pagefile.sys'])fs.writeFileSync(join(fixture,file),'fixture');fs.symlinkSync(join(fixture,'a.txt'),join(fixture,'link'));
    const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');const app=Fastify({logger:false});const calls:unknown[]=[];
    const ws={registerGatewayFsNode(node:any){calls.push(['register',{...node,name:node.name.startsWith('Gateway (')?'Gateway ($HOST)':node.name,registeredAt:/^\d{4}-\d\d-\d\dT/.test(node.registeredAt)}]);},getFsNodes(){calls.push(['nodes']);return [{id:'remote'}];},async proxyFsRoots(id:unknown){calls.push(['roots',id]);if(call.fail)throw call.nonError?'failure':new Error('fixture proxy failed');return [{name:'Remote',path:'C:/',type:'dir'}];},async proxyFsBrowse(...args:unknown[]){calls.push(['browse',...args]);if(call.fail)throw call.nonError?'failure':new Error('fixture proxy failed');return {path:'C:/remote',entries:[]};}};
    try{const subject=await import(specifier);subject.registerFilesystemRoutes(app,call.noWs?undefined:ws);await app.ready();const responses=[];for(const request of call.requests){const response=await app.inject({...request,url:request.url.replaceAll('$FIXTURE',fixture)});responses.push({status:response.statusCode,body:response.json()});}
      return JSON.parse(JSON.stringify({responses,calls}).replaceAll(fixture,'$FIXTURE').replaceAll(os.homedir(),'$HOME').replaceAll(new URL('../../../', import.meta.url).pathname.replace(/\/$/,''),'$PROJECT'));
    }finally{await app.close();fs.rmSync(fixture,{recursive:true,force:true});}
  }

  if (call.op === 'sourcereview.protocols') {
    const subject=await import(specifier);const controller=new AbortController();
    if(call.abort==='before')controller.abort();
    let listeningPort=0;const normalize=(output:any)=>({...output,engineVersion:output.engineVersion.startsWith('bun:')?'bun':output.engineVersion,evidence:output.evidence.map(({id,observedAt,port,...entry}:any)=>({...entry,portIdentity:port===listeningPort,idFormat:/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(id),timeFormat:/^\d{4}-\d\d-\d\dT/.test(observedAt)}))});
    if(call.action==='rule')return subject.rule('fixture.rule','Fixture rule','low','Apply fixture fix',2);
    // Synthetic fixture key/certificate; never used for a real service or account.
    const key="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDNyXUFtu6TBEPZ\nuJ5vU9zL+uB84axtyz+gagF7dtWH8RVWV3/27yGxzYHCMTIwJcPfRTe8UPTww4q2\nM6yv8AtcMVZCcl799/yGRhzWLzssFSmK2Aq8WnSyeRZA5nUXyep7yOBrA546K7eK\nfhyUO48njenaSaXIkuypC0eJXfBeUah4lG5UIcqUd5yGUSGfUBOkhjgDk1W5Km5A\ni6an0SiJMDk4KXt6BqnUtdbPVSKArIXUj2pD+FGrEvlZcSYx3/C07dzfU749lovJ\n/O4eEdXagbu3fFGGs0TnGxR3jFNbhCtRr5OEDfAKviXUFSJN8byaQBWq5X8AD8rG\natIOA1dxAgMBAAECggEACp1y100xhdYroK0sI5aNj27s6hZ6AxRtdhIBxiN40pEx\nmJKUCYaHuLQ6Ov63zJrc9EUgD3Rv5PJV0x3uHwnFHoe/RHvmZe7HGi8s0jHY8B0w\ne/a2qVd4BGp/JswqMF/zI+rouuWSmHIkR95HMfmyz5CpT3JmPR3XEsXJCJhf5us8\nSmdrcYRGgKHVCfflpRm1vlQ2IdeGPZnBC+6eJaNNB8y2GbPKnWv48SrqHzQgrSbJ\nPiB+f/A4OdQsGByrN4Vw6MVj1lp6qnXTFColJB75R5az2wvLcvVYUBo8hiWw0D68\n5Ab71YpjV29KhsZRfR6BlgBnltbXcRDaiD+y3UTaQQKBgQDrGmoLeWKg35pEsVkH\n6b8lckMMCDpyLePZY1hC+wlxLgO4grq9G2Jm6GxqTf+QIW6mGollA8Mf+9S8pqju\nkRVek2/p/3uHDNnesjOIdlPHfQaorgVxEWzdhokRiutkhxJiBKFc/E3GbfU96NjK\nFRQsIfDA4191HQgAs5FgLTUhpwKBgQDgE/mmuKtXuRR5urfp0U8zV8LrpzrZ+3A5\nu/4uCnw4VT5RJH/mFqgbVDHk5uXDx2VfnT7gWZNt2exDYlL02CFXwwbyVM7KopfS\nPj/zjBUk46B16XgdpzzlUgLGfKUUSXy8HB+0oT4xFyISYsbiFmvE68iA41Y5D5Qn\nBqaUjXvxJwKBgGZrHWNeP+8hOc1PDR/7Xj/r5PVq6Dsxbp8XPi3/un9JsmlA2iTj\ntxxpiEFPNVQOnGtUCCKvXuOiC20blWBIZ+zJgemIWMHegVMYgoaiNaEkADCfjtNQ\n6gIfR7sSr7Udeo6kwb8GUsNsx3du5nIyeJU5O+5rnvwf54qWr3AcgZblAoGBAIA8\nrkktslFXyFIJ+6rCcLMPbKv0XofVj9parhKnSYPrtOg3HUMOgFJzksJPKfsrJ+ba\nVNuMKAVcDAxcPuGEt0BEirswsc/h0UUu/uZgqtEbu/7/CBDgXsdWceQp/Udo7wuw\nhKyZAsCRXpxrDyrgbfiaf3rTn8q0EbNr6PVnKyFNAoGBAMBjsJBjyez4g2cP3V61\nhAAM539pJyed7ecQSepEnOKcng3KKwCmnjMRUTtQIRMEbhxAHjGC95v67yLHlglj\nHjypGTs8lYYL8U44WiUsxxYASRQfzDD0XhZLuYwjGwMi03zavwX2/yMtJUuK1gCo\n3YxaivPmuA5HOWs3CYKia7r1\n-----END PRIVATE KEY-----\n",cert="-----BEGIN CERTIFICATE-----\nMIIDDDCCAfSgAwIBAgIBATANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAlsb2Nh\nbGhvc3QwHhcNMjYxMDE5MjAwNTU3WhcNMzYxMDE2MjAwNTU3WjAUMRIwEAYDVQQD\nDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDNyXUF\ntu6TBEPZuJ5vU9zL+uB84axtyz+gagF7dtWH8RVWV3/27yGxzYHCMTIwJcPfRTe8\nUPTww4q2M6yv8AtcMVZCcl799/yGRhzWLzssFSmK2Aq8WnSyeRZA5nUXyep7yOBr\nA546K7eKfhyUO48njenaSaXIkuypC0eJXfBeUah4lG5UIcqUd5yGUSGfUBOkhjgD\nk1W5Km5Ai6an0SiJMDk4KXt6BqnUtdbPVSKArIXUj2pD+FGrEvlZcSYx3/C07dzf\nU749lovJ/O4eEdXagbu3fFGGs0TnGxR3jFNbhCtRr5OEDfAKviXUFSJN8byaQBWq\n5X8AD8rGatIOA1dxAgMBAAGjaTBnMB0GA1UdDgQWBBREeyZX4QZcMJA+UeU84fkF\nBvNrGDAfBgNVHSMEGDAWgBREeyZX4QZcMJA+UeU84fkFBvNrGDAPBgNVHRMBAf8E\nBTADAQH/MBQGA1UdEQQNMAuCCWxvY2FsaG9zdDANBgkqhkiG9w0BAQsFAAOCAQEA\nfyjtyMbqHEQg/foqhpp577ynCX5lVAymGiUNyDz5br7Zk3Q/MjagCxjaGtwpu0Z+\nTTYrPCv1MvBQ1i3ZDMT1lBDvbJTtAdhIhONvlDhSD4QFBiW8BJ2aRtRhQMBJCIME\nfxVlRb/1BLncMi6fyJWDOvhrMFQdUakFnTG0DHoyjNa7H69n+skfMshvZn9gJOci\nYEw7p1sC3dCh6x9dxFRsIDMiKP6Uqdkd8NUkDGdjV/bqLuuqDCWDLyL7rXuy5/kx\nYwVsCVpVlh2OZAsDzE17XyXzDRmOYD21Vm+oeBbG16aZV6vM8D4aKjgZXQkcYdVE\nbhJp6q8FiArdQpLQJ65qnw==\n-----END CERTIFICATE-----\n";
    const calls:unknown[]=[];let server:any;const sockets=new Set<any>();
    if(call.action==='tls'){
      const tls=await import('node:tls');server=tls.createServer({key,cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},socket=>{socket.resume();});server.on('tlsClientError',()=>{});
    }else if(call.action==='ssh'){
      const net=await import('node:net');server=net.createServer(socket=>{calls.push(['connect']);socket.on('error',()=>{});if(call.abort==='during')return;for(const chunk of call.chunks??[])socket.write(chunk);if(!call.keepOpen)socket.end();});
    }else{
      const handler=(request:any,response:any)=>{calls.push(['request',request.method,request.url,request.headers['user-agent'],request.headers.accept,request.headers.connection]);response.writeHead(call.status??200,call.headers??{});response.end(call.bytes?Buffer.alloc(call.bytes,120):'fixture');};
      if(call.secure){const https=await import('node:https');server=https.createServer({key,cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},handler);}else{const http=await import('node:http');server=http.createServer(handler);}
      server.on('clientError',()=>{});
    }
    server.on('connection',(socket:any)=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
    const oldNow=Date.now;
    try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;listeningPort=port;
      if(call.now!==undefined)Date.now=()=>call.now;
      const pending=call.action==='tls'?subject.checkTls('127.0.0.1',port,call.serverName,controller.signal):call.action==='ssh'?subject.checkSsh('127.0.0.1',port,controller.signal):subject.checkHttp('127.0.0.1',port,!!call.secure,controller.signal);
      if(call.abort==='during')queueMicrotask(()=>controller.abort());
      return {output:normalize(await pending),calls};
    }finally{Date.now=oldNow;for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  }

  if (call.op === 'sourcereview.messengerHistory') {
    const {mock}=await import('bun:test');const calls:unknown[]=[],fills:number[]=[];let imports=0,decrypts=0;const savedFill=Buffer.prototype.fill;
    const base=new URL('packages/gateway/',new URL('../../../', import.meta.url)).pathname;
    const machine={async importRoomKeys(value:unknown,progress:unknown){imports++;calls.push(['import',value,typeof progress]);if(call.fail==='import')throw new Error('fixture import failed');},async exportRoomKeys(filter:(key:unknown)=>boolean){calls.push(['export',filter({})]);return 'fixture-export';},async decryptRoomEvent(event:unknown,room:any,settings:any){calls.push(['decryptEvent',event,room.value,settings.value]);if(call.fail==='decrypt')throw new Error('fixture decrypt failed');return {event:call.invalidEvent?'invalid':JSON.stringify({type:'m.room.message',content:{body:'fixture'}}),free(){calls.push(['freeResult']);}};},close(){calls.push(['close']);}};
    class Id {constructor(public value:string){}}class Room extends Id {free(){calls.push(['freeRoom']);}}class Settings {constructor(public value:string){}free(){calls.push(['freeSettings']);}}
    mock.module(Bun.resolveSync('@matrix-org/matrix-sdk-crypto-nodejs',base),()=>({BackupDecryptionKey:{fromBase64(value:unknown){calls.push(['key',value]);if(call.fail==='key')throw new Error('fixture key failed');return {megolmV1PublicKey:{publicKeyBase64:'fixture-public'},decryptV1(...args:unknown[]){decrypts++;if(!call.large)calls.push(['decryptBackup',...args]);if(call.fail==='backupDecrypt')throw new Error('fixture backup decryption failed');return call.invalidClear?'invalid':JSON.stringify({algorithm:'fixture',room_id:'untrusted-room',session_id:'untrusted-session',session_key:'fixture-key'});}};}}}));
    mock.module(Bun.resolveSync('@matrix-org/matrix-sdk-crypto-wasm',base),()=>({OlmMachine:{async initialize(user:any,device:any){calls.push(['initialize',user.value,device.value]);if(call.fail==='initialize')throw new Error('fixture initialize failed');return machine;}},UserId:Id,DeviceId:Id,RoomId:Room,DecryptionSettings:Settings,TrustRequirement:{Untrusted:'untrusted'}}));
    try{const subject=await import(specifier);const history=await subject.MessengerHistory.create('@fixture:invalid','fixture-device',call.exported);
      if(call.action==='create'){history.close();return {calls};}
      if(call.action==='decrypt'){try{return {result:await history.decrypt('!room:invalid',{type:'encrypted',content:{ciphertext:'fixture'}}),calls};}catch(error){return {error:(error as Error).name==='SyntaxError'?'SyntaxError':(error as Error).message,calls};}finally{history.close();}}
      Buffer.prototype.fill=function(value:any,...args:any[]):any{if(value===0&&(this.length===32||this.length===35))fills.push(this.length);return (savedFill as any).call(this,value,...args);};
      const client={async doRequest(...args:any[]){calls.push(['request',...args]);if(call.fail==='request')throw new Error('fixture request failed');if(args[1].endsWith('/version'))return {algorithm:call.algorithm??'m.megolm_backup.v1.curve25519-aes-sha2',version:call.version===false?'':'v1',auth_data:{public_key:call.wrongKey?'wrong-public':'fixture-public'}};
        if(call.large)return {rooms:{'!room:invalid':{sessions:Object.fromEntries(Array.from({length:50001},(_,i)=>[`session-${i}`,{session_data:{ephemeral:'e',mac:'m',ciphertext:'c'}}]))}}};
        return {rooms:call.empty?{}:{'!room:invalid':{sessions:{'session-1':{session_data:{ephemeral:'e',mac:'m',ciphertext:'c'}},'session-2':{session_data:{ephemeral:'e2',mac:'m2',ciphertext:'c2'}}}}}};}};
      try{return {result:await history.restore(client,call.key),calls,fills,imports,decrypts};}catch(error){return {error:(error as Error).name==='SyntaxError'?'SyntaxError':(error as Error).message,calls,fills,imports,decrypts};}finally{history.close();}
    }catch(error){return {error:(error as Error).name==='SyntaxError'?'SyntaxError':(error as Error).message,calls,fills,imports,decrypts};}
    finally{Buffer.prototype.fill=savedFill;mock.restore();}
  }

  if (call.op === 'sourcereview.workbenchTools') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const signal=new AbortController().signal;const now=Date.now;Date.now=()=>Date.parse('2030-01-01T00:00:00Z');
    const record=(method:string,...args:unknown[])=>{calls.push([method,...args.map(arg=>arg===signal?'$SIGNAL':arg)]);if(call.fail===method)throw call.nonError?'failure':new Error('fixture '+method+' failed');};
    const run={id:'run-fixture',scopeId:'scope-fixture',status:call.status??'completed',findingIds:['finding-fixture'],evidence:[{id:'e1',summary:'first'},{id:'e2',summary:'unrelated'}],coverageGaps:['fixture gap'],engine:'fixture-engine',engineVersion:'fixture-version'};
    const service={start(...args:unknown[]){record('start',...args);return run;},async wait(...args:unknown[]){record('wait',...args);return run;},get(...args:unknown[]){record('get',...args);return run;},async engines(...args:unknown[]){record('engines',...args);return {trivy:'fixture'};},history(...args:unknown[]){record('history',...args);return {runs:call.previous??[],findings:Array.from({length:30},(_,i)=>({id:`f${i}`}))};},finding(...args:unknown[]){record('finding',...args);return {id:'finding-fixture',runId:'run-fixture',title:'Fixture finding',evidenceIds:['e1']};},plan(...args:unknown[]){record('plan',...args);return {rollback:'fixture rollback'};},async verify(...args:unknown[]){record('verify',...args);return {status:call.verification??'verified-absent',reason:'fixture verification'};},compare(...args:unknown[]){record('compare',...args);return {compatible:true};},report(...args:unknown[]){record('report',...args);return {redacted:true};},authorize(...args:unknown[]){record('authorize',...args);}};
    const scope={expiresAt:call.expired?'2029-01-01T00:00:00Z':'2030-01-01T00:30:00Z',targets:['192.0.2.1','192.0.2.2','192.0.2.3','192.0.2.4'],exclusions:['192.0.2.3'],vantagePoint:'gateway'};
    const assessmentRun={id:'tcp-fixture',completedAt:'fixture-time',status:call.status??'completed',scope,observations:[{target:'192.0.2.1',state:'refused',evidenceId:'tcp1'},{target:'192.0.2.3',state:'open',evidenceId:'excluded'},{target:'192.0.2.2',state:'timeout',evidenceId:'tcp2'}],coverageGaps:['tcp gap']};
    const assessment={getRun(...args:unknown[]){record('tcp.get',...args);return assessmentRun;},getScope(...args:unknown[]){record('scope',...args);return scope;},start(...args:unknown[]){record('tcp.start',...args);return assessmentRun;},async wait(...args:unknown[]){record('tcp.wait',...args);return assessmentRun;}};
    const job={id:'job-fixture',enabled:true,userId:'user',toolName:'security.monitor.tick',input:{scopeId:'scope-fixture',profile:'tls',target:'192.0.2.1',port:443},...call.job};
    const scheduler={create(...args:unknown[]){record('job.create',...args);return {id:'job-fixture'};},update(...args:unknown[]){record('job.update',...args);},get(...args:unknown[]){record('job.get',...args);return call.missingJob?null:job;}};
    mock.module(new URL('packages/gateway/src/security/workbench.ts',new URL('../../../', import.meta.url)).pathname,()=>({getSecurityWorkbench:()=>service}));mock.module(new URL('packages/gateway/src/security/assessment.ts',new URL('../../../', import.meta.url)).pathname,()=>({getAssessmentService:()=>assessment}));
    try{const subject=await import(specifier),tools=subject.createSecurityWorkbenchTools(call.noScheduler?undefined:scheduler);if(call.action==='metadata')return tools.map((t:any)=>({name:t.name,risk:t.risk??null,consent:t.defaultConsentLevel??null}));
      const tool=tools.find((t:any)=>t.name===call.name);return {result:await tool.execute(call.input??{},{sessionId:'session-fixture',projectRoot:'/fixture',userId:'user',requestedBy:'mcp-client',signal,...call.context}),calls};
    }finally{Date.now=now;mock.restore();}
  }

  if (call.op === 'sourcereview.catalogTool') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];
    mock.module(new URL('packages/gateway/src/tools/agent-loop.ts',new URL('../../../', import.meta.url)).pathname,()=>({toOpenAIName(name:string){calls.push(['name',name]);return name.replaceAll('.','_');}}));
    const tools=(call.tools??[]).map((tool:any)=>({description:'fixtureuniqueword',parameters:{type:'object',properties:{id:{type:'string'}}},...tool,...(call.largeSchema?{parameters:{type:'object',properties:{huge:{type:'string',description:'x'.repeat(12000)}}}}:{})}));
    const registry={list(){calls.push(['list']);return tools;},listForMcp(){calls.push(['mcp']);return call.mcpEmpty?[]:tools;},search(query:string,options:any){calls.push(['search',query,options.candidates.map((t:any)=>t.name),options.limit]);return options.candidates.slice(0,options.limit);}};
    try{const subject=await import(specifier);const result=await subject.createJaitCatalogTool(registry).execute(call.input??{},{requestedBy:call.mcp?'mcp-client':'web'});const data=result.data;
      const pages=data.pages.map((page:any)=>({id:page.id,toolCount:page.toolCount,...(page.tools?{hasMoreTools:page.hasMoreTools,tools:page.tools,features:page.features.map((feature:any)=>({id:feature.id,available:feature.availableToolRefs,missing:feature.missingToolRefs}))}:{})}));
      const matches=data.matches.map((match:any)=>({name:match.name,openai_name:match.openai_name,properties:Object.keys(match.parameters.properties)}));
      return {ok:result.ok,message:result.message,pages,matches,pageLinks:data.pageLinks,uncataloguedTools:data.uncataloguedTools,schemaLookupRequired:data.schemaLookupRequired,calls};
    }finally{mock.restore();}
  }

  if (call.op === 'sourcereview.networkTool') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const data=call.data??{subnet:'192.0.2',hosts:[],scannedAt:'fixture-time',durationMs:12};
    mock.module(new URL('packages/gateway/src/lib/network-scan.ts',new URL('../../../', import.meta.url)).pathname,()=>({async scanNetwork(input:unknown){calls.push(input);if(call.fail)throw call.nonError?'failure':new Error('fixture scan failed');return data;}}));
    let sqlite:any;const logs:unknown[]=[];const oldError=console.error;
    try{const subject=await import(specifier);subject.setNetworkScanDb(undefined);
      if(call.action==='initial')return subject.getLatestNetworkScan();
      if(call.action==='persist'){
        const {Database}=await import('bun:sqlite');sqlite=new Database(':memory:');sqlite.exec('CREATE TABLE network_hosts (ip TEXT PRIMARY KEY,mac TEXT,hostname TEXT,os_version TEXT,open_ports TEXT,ssh_reachable INTEGER,agent_status TEXT,providers TEXT,first_seen_at TEXT,last_seen_at TEXT,scanned_at TEXT)');subject.setNetworkScanDb(sqlite);
        for(const snapshot of call.snapshots)subject.setLatestNetworkScan(snapshot);
        return {rows:sqlite.query('SELECT * FROM network_hosts ORDER BY ip').all(),cache:subject.getLatestNetworkScan()};
      }
      if(call.action==='persistError'){
        console.error=(...args:unknown[])=>{logs.push([args[0],(args[1] as Error).message]);};subject.setNetworkScanDb({prepare(){throw new Error('fixture database failed');}});subject.setLatestNetworkScan(data);return {logs,cacheIdentity:subject.getLatestNetworkScan()===data};
      }
      subject.setLatestNetworkScan({subnet:'initial',hosts:[],scannedAt:'initial',durationMs:0});const tool=subject.createNetworkScanTool();const result=await tool.execute(call.input,{});
      return {result,calls,cache:subject.getLatestNetworkScan(),resultIdentity:result.data===data};
    }finally{console.error=oldError;sqlite?.close();mock.restore();}
  }

  if (call.op === 'sourcereview.piProvision') {
    const fs=await import('node:fs');const os=await import('node:os');const base=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;fs.mkdirSync(base,{recursive:true});const fixture=fs.mkdtempSync(join(base,'pi-provision-'));const oldTmp=process.env.TMPDIR,oldWarn=console.warn,oldMask=process.umask(0o022);const warnings:string[]=[];process.env.TMPDIR=fixture;console.warn=(value:unknown)=>warnings.push(String(value));
    try{if(os.tmpdir()!==fixture)throw new Error('Fixture temporary directory was not applied');const subject=await import(specifier);
      if(call.action==='types')return {types:subject.PI_BASED_PROVIDER_TYPES,values:call.values.map((v:string)=>subject.isPiBasedProvider(v))};
      const options={sessionId:call.sessionId??'session-fixture',realPiCommand:call.command};
      if(call.action==='execute'){const command=join(fixture,'pi command $dollar `tick` "quote" \\backslash');fs.writeFileSync(command,`#!/bin/sh\nexec node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "$@"\n`,{mode:0o755});options.realPiCommand=command;}
      const provision=subject.provisionPiMcp(call.provider??'pi',call.servers,options);
      if(!provision)return {result:null,warnings:warnings.map(w=>w.replaceAll(fixture,'$FIXTURE')),entries:fs.readdirSync(fixture)};
      const wrapper=provision.env.PI_ACP_PI_COMMAND,root=join(wrapper,'..'),config=join(root,'mcp.json');
      if(call.action==='parallel'){const other=subject.provisionPiMcp('pi-gemini',call.servers,{sessionId:'session-fixture'});const otherPath=other.env.PI_ACP_PI_COMMAND;provision.cleanup();const result={distinct:wrapper!==otherPath,firstRemoved:!fs.existsSync(wrapper),secondRetained:fs.existsSync(otherPath)};other.cleanup();other.cleanup();return {...result,secondRemoved:!fs.existsSync(otherPath)};}
      const content=fs.readFileSync(wrapper,'utf8').replaceAll(root,'$PROVISION');const result:any={envKeys:Object.keys(provision.env),config:JSON.parse(fs.readFileSync(config,'utf8')),wrapper:content,wrapperMode:fs.statSync(wrapper).mode&0o777,directoryMode:fs.statSync(root).mode&0o777};
      if(call.action==='execute'){const {execFileSync}=await import('node:child_process');result.argv=JSON.parse(execFileSync(wrapper,call.args??[],{encoding:'utf8',timeout:5000})).map((a:string)=>a.replaceAll(root,'$PROVISION'));result.wrapper=content.replaceAll(options.realPiCommand!.replace(/["\\$\x60]/g,(c:string)=>'\\'+c),'$COMMAND');}
      provision.cleanup();provision.cleanup();result.removed=!fs.existsSync(root);return result;
    }finally{if(oldTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=oldTmp;console.warn=oldWarn;process.umask(oldMask);fs.rmSync(fixture,{recursive:true,force:true});}
  }

  if (call.op === 'sourcereview.evalGateway') {
    const fs=await import('node:fs'),os=await import('node:os');const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');
    const parent=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(join(parent,'eval-gateway-'));const oldTmp=process.env.TMPDIR,oldFetch=globalThis.fetch,oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;process.env.TMPDIR=root;
    const calls:unknown[]=[],timerLog:unknown[]=[];const timers=new Map<number,{fn:()=>void,ms:number}>();let timerId=0,state='';const controller=new AbortController();
    const child:any=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=(signal:string)=>{calls.push(['kill',signal]);if(signal==='SIGTERM'&&call.forceKill){queueMicrotask(()=>{for(const [id,timer]of timers)if(timer.ms===5000){timers.delete(id);timer.fn();}});}else queueMicrotask(()=>child.emit('close',0));return true;};
    child.stdin.end=(value:string)=>{calls.push(['stdin',JSON.parse(value)]);queueMicrotask(()=>{
      if(call.stderr)child.stderr.emit('data',call.stderr.text.repeat(call.stderr.count));
      if(call.trigger==='error'){child.emit('error',new Error('fixture child failed'));return;}
      if(call.trigger==='close'){child.emit('close',2);return;}
      if(call.trigger==='abort'){controller.abort();return;}
      if(call.trigger==='timeout'){for(const [id,timer]of timers)if(timer.ms===60000){timers.delete(id);timer.fn();}return;}
      for(const chunk of call.chunks??['noise\nJAIT_EVAL_',`READY ${JSON.stringify(call.ready??{port:32123,token:'fixture-child-token'})}\n`])child.stdout.emit('data',chunk);
    });return child.stdin;};
    globalThis.setTimeout=((fn:()=>void,ms:number)=>{const id=++timerId;timers.set(id,{fn,ms});timerLog.push(['set',ms]);return {id,unref(){return this;}};}) as unknown as typeof setTimeout;
    globalThis.clearTimeout=((timer:any)=>{timerLog.push(['clear',timers.get(timer?.id)?.ms??null]);timers.delete(timer?.id);}) as unknown as typeof clearTimeout;
    globalThis.fetch=(async(url:unknown,options:any)=>{calls.push(['fetch',String(url),{headers:options.headers,redirect:options.redirect,aborted:options.signal.aborted}]);return {ok:(call.status??200)===200,status:call.status??200,json:async()=>call.settings??{jait_backend:'ollama',api_keys:{FIXTURE:'secret'}}};}) as unknown as typeof fetch;
    const launch=(command:string,args:string[],options:any)=>{state=options.env.JAIT_STATE_DIR;calls.push(['spawn',command,args.map(arg=>arg.split('/').at(-1)),{env:Object.fromEntries(['__JAIT_CLI','JAIT_STATE_DIR','JAIT_DB_PATH','PORT','WS_PORT','HOST','LOG_LEVEL','LLM_PROVIDER','JAIT_PRIMARY_GATEWAY','JAIT_PRIMARY_TOKEN','JAIT_NODE_ONLY'].map(k=>[k,options.env[k]])),jwtFormat:/^[a-f\d-]{36}$/.test(options.env.JWT_SECRET),stdio:options.stdio,windowsHide:options.windowsHide}]);return child;};
    const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(state||'__ABSENT_STATE__','$STATE').replaceAll(root,'$FIXTURE'));
    try{if(os.tmpdir()!==root)throw new Error('Evaluation fixture temp path not applied');if(call.preAbort)controller.abort(new DOMException("fixture cancelled","AbortError"));const subject=await import(specifier);
      try{const result=await subject.startIsolatedEvaluationGateway({gateway:'https://fixture.invalid/base',token:'fixture-parent-token',...(call.noSignal?{}:{signal:controller.signal})},{spawn:launch});const mode=fs.statSync(result.state).mode&0o777;await Promise.all([result.stop(),result.stop()]);return normalize({result:{gateway:result.gateway,token:result.token,stateMode:mode,removed:!fs.existsSync(result.state)},calls,timers:timerLog,pendingTimers:timers.size});}
      catch(error){return normalize({error:call.preAbort&&(error===undefined||error===controller.signal.reason)?'Pre-aborted':error===undefined?'Undefined rejection':(error as Error).name==='AbortError'?'AbortError':(error as Error).name==='SyntaxError'?'SyntaxError':(error as Error).message,calls,timers:timerLog,pendingTimers:timers.size,remaining:fs.readdirSync(root)});}
    }finally{globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;if(oldTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=oldTmp;fs.rmSync(root,{recursive:true,force:true});}
  }
  if (call.op === 'sourcereview.evalChild') {
    const {mock}=await import('bun:test');const {Readable}=await import('node:stream');const stdin=Object.getOwnPropertyDescriptor(process,'stdin'),log=console.log;const oldState=process.env.JAIT_STATE_DIR,oldDb=process.env.JAIT_DB_PATH,oldSecret=process.env.JWT_SECRET;const calls:unknown[]=[],lines:unknown[]=[];const db={},sqlite={close(){calls.push(['close']);}},user={id:'eval-user',username:'evaluation'};
    const boundary=(relative:string)=>new URL(relative,new URL('../../../', import.meta.url)).pathname;
    mock.module(boundary('packages/gateway/src/db/index.ts'),()=>({async openDatabase(path:unknown){calls.push(['open',path]);return {db,sqlite};},migrateDatabase(value:unknown){calls.push(['migrate',value===sqlite]);}}));
    mock.module(boundary('packages/gateway/src/services/users.ts'),()=>({UserService:class {constructor(value:unknown){calls.push(['users',value===db]);}createUser(name:unknown,password:string){calls.push(['create',name,/^[a-f\d-]{36}$/.test(password)]);return user;}updateSettings(...args:unknown[]){calls.push(['settings',...args]);}}}));
    mock.module(boundary('packages/gateway/src/security/http-auth.ts'),()=>({async signAuthToken(received:unknown,secret:unknown){calls.push(['sign',received===user,secret]);return 'fixture-eval-token';}}));
    mock.module(boundary('packages/gateway/src/index.ts'),()=>({async main(options:any){calls.push(['main',options.evaluation]);if(call.failMain)throw new Error('fixture main failed');options.onReady(32123);}}));
    process.env.JAIT_STATE_DIR=call.noState?'':'/fixture/state';process.env.JAIT_DB_PATH=call.badDb?'/fixture/other.db':'/fixture/state/data/jait.db';process.env.JWT_SECRET='fixture-jwt-secret';Object.defineProperty(process,'stdin',{configurable:true,value:Readable.from([JSON.stringify(call.settings??{}).slice(0,5),JSON.stringify(call.settings??{}).slice(5)])});console.log=(...args:unknown[])=>{lines.push(args);};
    try{try{await import(new URL(specifier,import.meta.url).href+'?fixture='+crypto.randomUUID());return {calls,lines};}catch(error){return {error:(error as Error).message,calls,lines};}}
    finally{if(stdin)Object.defineProperty(process,'stdin',stdin);console.log=log;for(const [key,value]of [['JAIT_STATE_DIR',oldState],['JAIT_DB_PATH',oldDb],['JWT_SECRET',oldSecret]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}mock.restore();}
  }

  if (call.op === 'sourcereview.sandboxProcess') {
    const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');const subject=await import(specifier);const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
    const timers=new Map<number,{fn:()=>void,ms:number}>();let timerId=0;const calls:unknown[]=[],events:string[]=[];let main:any,marker='';const children:any[]=[];
    globalThis.setTimeout=((fn:()=>void,ms:number)=>{const id=++timerId;timers.set(id,{fn,ms});if(ms===2000||(ms===5000&&call.cleanupHang))queueMicrotask(()=>{const timer=timers.get(id);if(timer){timers.delete(id);timer.fn();}});return {id,unref(){return this;}};}) as unknown as typeof setTimeout;
    globalThis.clearTimeout=((timer:any)=>{timers.delete(timer?.id);}) as unknown as typeof clearTimeout;
    const launch=(command:string,args:string[],options:any)=>{const child:any=new EventEmitter();children.push(child);child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=(signal:string)=>{calls.push(['kill',signal]);queueMicrotask(()=>child.emit('close',137));return true;};
      const wrapper=args.find(a=>a.startsWith("printf '__JAIT_SANDBOX_PID_"));if(wrapper){marker=/printf '(.*)%s/.exec(wrapper)![1]!;main=child;calls.push(['spawn',command,args.map(a=>a.replaceAll(marker,'$MARKER')),options]);}
      else {calls.push(['cleanup',command,args,options]);if(!call.cleanupHang)queueMicrotask(()=>child.emit(call.cleanupError?'error':'close',call.cleanupError?new Error('cleanup failed'):0));}return child;};
    const invocation=['docker','exec','--user','1000','fixture-box','bash','-lc',call.command??'printf fixture'];
    try {
      if(call.capacity){const executions:any[]=[];for(let i=0;i<50;i++)executions.push(subject.startSandboxBackgroundProcess(invocation,'fixture-box',500,false,{spawn:launch}));let error='';try{subject.startSandboxBackgroundProcess(invocation,'fixture-box',500,false,{spawn:launch});}catch(e){error=(e as Error).message;} // Every fake child is retained independently by its close callback.
        const spawned=calls.length;for(const execution of executions)void execution; // Close all fakes via retained emitter list below.
        for(const child of children)child.emit('close',0);await Promise.all(executions.map(e=>e.completion));const after=subject.startSandboxBackgroundProcess(invocation,'fixture-box',500,false,{spawn:launch});main.emit('close',0);await after.completion;return {spawned,error,recovered:true,pendingTimers:timers.size};}
      const execution=subject.startSandboxBackgroundProcess(invocation,'fixture-box',call.timeout??500,call.removeContainer??false,{spawn:launch});const unsubscribe=execution.onOutput((chunk:string)=>events.push(chunk));execution.onOutput(()=>{throw new Error('observer fixture');});
      for(const action of call.actions??[]){if(action.kind==='stdout'){const text=String(action.text??'').replaceAll('$MARKER',marker).repeat(action.repeat??1);main.stdout.emit('data',Buffer.from(text));}else if(action.kind==='stderr')main.stderr.emit('data',Buffer.from(String(action.text??'').repeat(action.repeat??1)));else if(action.kind==='unsubscribe')unsubscribe();else if(action.kind==='error')main.emit('error',new Error(action.text??'transport failed'));else if(action.kind==='close')main.emit('close',action.code??0);else if(action.kind==='stop')await Promise.all([execution.stop(),execution.stop()]);else if(action.kind==='lifetime'){for(const[id,timer]of timers)if(timer.ms===Math.max(1000,call.timeout??500)+5000){timers.delete(id);timer.fn();}for(let i=0;i<12;i++)await Promise.resolve();}}
      const result=await execution.completion;await execution.stop();return JSON.parse(JSON.stringify({result,output:execution.output,events,calls,pendingTimers:timers.size}).replaceAll(marker,'$MARKER'));
    }finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
  }

  if (call.op === 'sourcereview.goFetch') {
    const subject=await import(specifier);
    if(call.action==='protocol')return call.models.map((model:string)=>subject.goProtocol(model));
    if(call.action==='request'){try{return subject.goRequest(call.body,call.protocol);}catch(error){return {error:(error as Error).name};}}
    const oldFetch=globalThis.fetch,calls:unknown[]=[],cancels:unknown[]=[];const llm={backend:'opencode-go',openaiModel:'claude-fixture',openaiApiKey:'fixture-key',openaiBaseUrl:'https://fixture.invalid/go/',sessionId:'fixture-session',...call.llm};const controller=new AbortController();let source:Response;
    if(call.frames||call.chunks){const encoder=new TextEncoder();const chunks=call.chunks??call.frames.map((frame:any)=>`data: ${typeof frame==='string'?frame:JSON.stringify(frame)}\n\n`);let index=0;source=new Response(new ReadableStream({pull(stream){if(index<chunks.length)stream.enqueue(encoder.encode(chunks[index++]));else if(call.endUpstream)stream.close();else return new Promise<void>(()=>{});},cancel(reason){cancels.push(reason??null);}}),{status:call.status??200,headers:{'content-type':'text/event-stream','x-fixture':'source'}});}
    else source=Response.json(call.response??{},{status:call.status??200,headers:{'x-fixture':'source'}});
    const init={method:'POST',headers:call.headers,body:JSON.stringify(call.body??{model:llm.openaiModel,messages:[],stream:!!(call.frames||call.chunks)}),signal:controller.signal};
    globalThis.fetch=(async(url:unknown,options:any)=>{calls.push({url:String(url),method:options.method,headers:Object.fromEntries(new Headers(options.headers).entries()),body:JSON.parse(String(options.body)),signalIdentity:options.signal===controller.signal});return source;}) as typeof fetch;
    try {const response=await subject.fetchJaitLlm(llm,'https://fixture.invalid/original',init);let data:unknown;
      if(call.cancel){await response.body!.cancel('fixture cancelled');data=null;}
      else if(call.frames||call.chunks){try{const text=await response.text();data=text.split('\n\n').filter(Boolean).map((line:string)=>line.slice(6)==='[DONE]'?'[DONE]':JSON.parse(line.slice(6)));}catch(error){data={error:(error as Error).message};}}
      else data=await response.json();
      return {identity:response===source,status:response.status,headers:Object.fromEntries(response.headers.entries()),data,calls,cancels};
    }finally{globalThis.fetch=oldFetch;}
  }

  if (call.op === 'sourcereview.ollamaDevice') {
    const subject=await import(specifier);const crypto=await import('node:crypto');const {homedir}=await import('node:os');
    if(call.action==='local')return call.urls.map((url:string)=>subject.isLocalOllamaUrl(url));
    const fs=await import('node:fs');const artifact=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;fs.mkdirSync(artifact,{recursive:true});const root=fs.mkdtempSync(join(artifact,'ollama-device-'));
    const seed=Buffer.alloc(32,7);const key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),type:'pkcs8',format:'der'}),publicKey=crypto.createPublicKey(key);const raw=publicKey.export({format:'der',type:'spki'}).subarray(-32);const uint=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};const bytes=(value:Buffer|string)=>{const data=Buffer.from(value);return Buffer.concat([uint(data.length),data]);};
    const ssh=Buffer.concat([bytes('ssh-ed25519'),bytes(raw)]);const variant=call.variant;let privatePart=Buffer.concat([seed,raw]);if(variant==='private-mismatch')privatePart=Buffer.concat([seed,Buffer.alloc(32)]);if(variant==='seed-mismatch'){privatePart=Buffer.from(privatePart);privatePart[0]=privatePart[0]!^1;}
    const inner=Buffer.concat([uint(123),uint(variant==='checks'?124:123),bytes(variant==='key-type'?'ssh-rsa':'ssh-ed25519'),bytes(variant==='public-length'?raw.subarray(1):raw),bytes(variant==='private-length'?privatePart.subarray(1):privatePart),bytes('fixture')]);
    let data=Buffer.concat([Buffer.from(variant==='magic'?'bad-magic':'openssh-key-v1\0'),bytes(variant==='cipher'?'aes256-ctr':'none'),bytes(variant==='kdf'?'bcrypt':'none'),bytes(variant==='kdf-options'?'bad':''),uint(variant==='multiple'?2:1),bytes(variant==='public-blob'?Buffer.alloc(10):ssh),bytes(inner)]);if(variant==='truncated')data=data.subarray(0,45);
    const pem=variant==='format'?'not a key':`-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString('base64')}\n-----END OPENSSH PRIVATE KEY-----${variant==='oversize'?' '.repeat(17000):''}`;
    const oldPath=process.env.JAIT_OLLAMA_DEVICE_KEY_PATH,oldFetch=globalThis.fetch,oldNow=Date.now;const calls:unknown[]=[];
    try{
      if(call.action==='parse'){try{const parsed=subject.parseOllamaDeviceKey(pem);const signature=subject.signOllamaRequest(parsed,'POST','/api/me','1700000000');const [pub,sig]=signature.split(':');return {type:parsed.asymmetricKeyType,publicMatches:Buffer.from(pub,'base64').equals(ssh),signatureValid:crypto.verify(null,Buffer.from('POST,/api/me?ts=1700000000'),publicKey,Buffer.from(sig,'base64')),wrongPathValid:crypto.verify(null,Buffer.from('POST,/api/other?ts=1700000000'),publicKey,Buffer.from(sig,'base64'))};}catch(error){return {error:(error as Error).message};}}
      if(call.action==='paths'){if(call.configured===null)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=call.configured;return subject.ollamaDeviceKeyPaths().map((path:string)=>path.replace(homedir(),'$HOME'));}
      const fixtureKey=join(root,'id_ed25519');if(!call.missingKey)fs.writeFileSync(fixtureKey,pem,{mode:0o600});process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=fixtureKey;Date.now=()=>1700000000000;let index=0;
      globalThis.fetch=(async(url:unknown,options:any)=>{const address=new URL(String(url));const authorization=new Headers(options.headers).get('authorization');let verified:unknown=null;if(authorization){const [pub,sig]=authorization.split(':');verified=Buffer.from(pub!,'base64').equals(ssh)&&crypto.verify(null,Buffer.from(`${options.method},${address.pathname}?ts=${address.searchParams.get('ts')}`),publicKey,Buffer.from(sig!,'base64'));}calls.push({url:address.href,method:options.method??'GET',redirect:options.redirect??null,signatureValid:verified,signalPresent:options.signal instanceof AbortSignal});const response=call.responses[index++]??{status:500,body:{}};if(response.error)throw new Error(response.error);return Response.json(response.body??{}, {status:response.status??200});}) as typeof fetch;
      try{const result=call.action==='signedIn'?await subject.fetchSignedInOllamaUsage(call.baseUrl,call.account):await subject.fetchOllamaDeviceUsage(call.account,call.fromFile?undefined:key);return {result,calls};}catch(error){return {error:(error as Error).message,status:(error as any).status??null,calls};}
    }finally{globalThis.fetch=oldFetch;Date.now=oldNow;if(oldPath===undefined)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=oldPath;fs.rmSync(root,{recursive:true,force:true});}
  }
  if (call.op === 'sourcereview.providerUpdates') {
    const subject=await import(specifier);const calls:unknown[]=[];let now=1700000000000,versionIndex=0;const oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;
    if(call.action==='native')return call.paths.map((p:string|null)=>subject.isNativeClaudeInstall(p));
    if(call.action==='resolve'){const fs=await import('node:fs');const base=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(join(base,'provider-path-')),oldPath=process.env.PATH;try{fs.mkdirSync(join(root,'a'));fs.mkdirSync(join(root,'b'));fs.writeFileSync(join(root,'a','fixture'),'x',{mode:0o600});fs.writeFileSync(join(root,'b','real'),'x',{mode:0o700});fs.symlinkSync(join(root,'b','real'),join(root,'b','fixture'));process.env.PATH=':'+join(root,'a')+':'+join(root,'b');return {found:subject.resolveCommandPath('fixture')?.replace(root,'$FIXTURE'),missing:subject.resolveCommandPath('missing')};}finally{if(oldPath===undefined)delete process.env.PATH;else process.env.PATH=oldPath;fs.rmSync(root,{recursive:true,force:true});}}
    const service=new subject.ProviderUpdateService({now:()=>new Date(now),intervalMs:1000,resolveCommandPath(command:string){calls.push(['resolve',command]);return call.native?'/fixture/.local/share/claude/cli':null;},async execFile(command:string,args:string[],options:unknown){calls.push(['exec',command,args,options]);if(args[0]!=='--version'&&call.updateError){if(call.updateError==='stderr')throw {stderr:' fixture stderr '};if(call.updateError==='string')throw 'string error';throw new Error('fixture exec failed');}const version=call.versions?.[versionIndex++]??call.current??'v1.2.3';return {stdout:call.onStderr?'':version,stderr:call.onStderr?version:''};},fetchImpl:async(url:unknown,options:any)=>{calls.push(['fetch',String(url),options.headers,options.signal instanceof AbortSignal]);return Response.json(call.latestBody??{version:call.latest??'1.3.0'},{status:call.status??200});}});
    try{if(call.action==='supports')return call.providers.map((p:string)=>service.supports(p));
      if(call.action==='lifecycle'){const callbacks:Array<()=>void>=[];globalThis.setInterval=((fn:()=>void,ms:number)=>{calls.push(['interval',ms]);callbacks.push(fn);return {unref(){calls.push(['unref']);}};}) as unknown as typeof setInterval;globalThis.clearInterval=((_timer:unknown)=>{calls.push(['clearInterval']);}) as typeof clearInterval;service.start();service.start();for(let i=0;i<12;i++)await Promise.resolve();callbacks[0]!();for(let i=0;i<12;i++)await Promise.resolve();service.stop();service.stop();return {calls};}
      try{const provider=call.provider??'codex';if(call.action==='update')return {result:await service.update(provider),calls};if(call.action==='concurrent')return {values:await Promise.all([service.getStatus(provider),service.getStatus(provider)]),calls};const first=await service.getStatus(provider);const values=[first];if(call.cache){values.push(await service.getStatus(provider));now+=999;values.push(await service.getStatus(provider));now++;values.push(await service.getStatus(provider));values.push(await service.getStatus(provider,true));}if(call.concurrent){const pending=await Promise.all([service.getStatus(provider,true),service.getStatus(provider)]);values.push(...pending);}return {values,calls};}catch(error){return {error:(error as Error).message,calls};}
    }finally{globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;service.stop();}
  }

  if (call.op === 'sourcereview.mailConnection') {
    const {mock}=await import('bun:test');const requests:unknown[]=[];let cancelled=0,reads=0;const oldFetch=globalThis.fetch;
    const resolveAddresses=async(host:unknown,options:unknown)=>{requests.push(['dns',host,options]);if(call.dnsError)throw new Error('fixture DNS failed');if(call.dnsTimeout)return new Promise(()=>{});return call.addresses??[{address:'93.184.216.34',family:4}];};
    const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;if(call.dnsTimeout){globalThis.setTimeout=((fn:()=>void)=>{queueMicrotask(fn);return 1;}) as any;globalThis.clearTimeout=(()=>{}) as any;}
    globalThis.fetch=Object.assign(async(url:unknown,options:any)=>{requests.push(['fetch',url,{redirect:options.redirect,signalPresent:options.signal instanceof AbortSignal}]);let chunks=call.chunks??[call.xml??''];if(call.byteLength)chunks=['x'.repeat(call.byteLength)];let index=0;return {ok:call.ok!==false,body:call.empty?null:{getReader(){return {async read(){reads++;if(call.readError)throw new Error('fixture read failed');return index<chunks.length?{done:false,value:new TextEncoder().encode(chunks[index++])}:{done:true};},async cancel(){cancelled++;}};}}} as any;},{preconnect:oldFetch.preconnect});
    try{
      const subject=await import(specifier);
      if(call.action==='schema')return call.inputs.map((input:any)=>{const result=subject[call.schema].safeParse(input);return result.success?{ok:true,value:result.data}:{ok:false};});
      const value=call.action==='public'?await subject.publicMailServer(call.config,resolveAddresses):await subject.discoverMailSettings(call.email??'alice@example.com');
      return {value,requests,cancelled,reads};
    }catch(error){return {error:(error as Error).message,requests,cancelled,reads};}
    finally{globalThis.fetch=oldFetch;globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;mock.restore();}
  }
  if (call.op === 'sourcereview.graphrag') {
    const subject=await import(specifier);const fs=await import('node:fs/promises');
    const snapshot=structuredClone(call.snapshot??{index:{graphVersion:'v1'},nodes:[],edges:[]});
    if(call.action==='summary')snapshot.nodes=Array.from({length:101},(_,index)=>({id:`n${index}`,label:`Node${index}`,type:'function',degree:0,sourceFile:'a.ts'}));
    if(call.action==='data')return subject.toGraphRagData(snapshot);
    if(call.action==='summary'){const data=subject.toGraphRagData(snapshot);return {entities:data.entities.length,textUnits:data.textUnits};}
    const root=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;await fs.mkdir(root,{recursive:true});const fixture=await fs.mkdtemp(join(root,'graphrag-'));const directory=join(fixture,'nested');
    if(call.action==='writeFailure')await fs.writeFile(directory,'blocked');
    try{const value=await subject.writeGraphRagExport(snapshot,directory);const files:Record<string,string>={};for(const file of (await fs.readdir(directory)).sort())files[file]=await fs.readFile(join(directory,file),'utf8');
      const normalize=(s:string)=>s.replaceAll(directory,'$OUTPUT').replaceAll(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g,'ISO_TIMESTAMP');return {manifest:JSON.parse(normalize(JSON.stringify(value))),files:Object.fromEntries(Object.entries(files).map(([key,value])=>[key,normalize(value)]))};
    }catch(error){return {error:call.action==='writeFailure'?(error as any).code:(error as Error).message,created:await fs.stat(directory).then(s=>s.isDirectory()).catch(()=>false)};}
    finally{await fs.rm(fixture,{recursive:true,force:true});}
  }
  if (call.op === 'sourcereview.graphTools') {
    const subject=await import(specifier);const calls:unknown[]=[];const signal=new AbortController().signal;const service:any={};
    for(const name of ['index','query','shortestPath','prepareGraphRag','getIndex'])service[name]=(...args:any[])=>{calls.push([name,...args.map(arg=>arg&&typeof arg==='object'?{...arg,...('signal'in arg?{signal:arg.signal===signal}: {})}:arg)]);if(call.fail)throw call.nonError?'fixture failure':new Error('fixture failure');return call.response;};
    const tools=subject.createCodeGraphTools(service);if(call.action==='metadata')return tools.map((t:any)=>({name:t.name,tier:t.tier,category:t.category,source:t.source,required:t.parameters.required??[]}));
    const tool=tools.find((t:any)=>t.name===call.name);return {result:await tool.execute(call.input??{}, {projectRoot:' /fixture/project ',userId:'owner',signal,...call.context}),calls};
  }
  if (call.op === 'sourcereview.graphRoutes') {
    const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');const app=Fastify({logger:false});
    const auth=await import(new URL('packages/gateway/src/security/http-auth.ts',new URL('../../../', import.meta.url)).href);const secret='fixture-graph-secret';const token=await auth.signAuthToken({id:'owner',username:'fixture'},secret);const calls:unknown[]=[];
    const {GraphifyUnavailableError}=await import(new URL('packages/gateway/src/services/code-graph/graphify-runner.ts',new URL('../../../', import.meta.url)).href);
    const service:any={};for(const name of ['getIndex','index','snapshot','query','prepareGraphRag','shortestPath'])service[name]=(...args:any[])=>{calls.push([name,...args.map(arg=>arg&&typeof arg==='object'?{...arg,...('signal'in arg?{signalPresent:typeof arg.signal?.aborted==='boolean',signal:undefined}:{})}:arg)]);if(call.fail==='unavailable')throw new GraphifyUnavailableError('fixture graph unavailable');if(call.fail==='notReady')throw new Error('Graph has not been indexed');if(call.fail)throw call.nonError?'fixture failure':new Error('fixture failure');return call.response??{fixture:name};};
    const projects={list(status:unknown,user:unknown){calls.push(['projects',status,user]);return call.projects??[{id:'project',rootPath:'/fixture/project',metadata:JSON.stringify({repositoryId:'repo'}),nodeId:'gateway'}];}};
    try{const subject=await import(specifier);subject.registerCodeGraphRoutes(app,{jwtSecret:secret},service,projects);const responses=[];for(const r of call.requests){const res=await app.inject({method:r.method,url:r.url,...(r.payload===undefined?{}:{payload:r.payload}),headers:r.unauth?{}:{authorization:'Bearer '+(r.invalid?'invalid':token)}});responses.push({status:res.statusCode,body:res.json()});}return JSON.parse(JSON.stringify({responses,calls}));}
    finally{await app.close();}
  }

  if (call.op === 'sourcereview.agentGithubTools') {
    const subject=await import(specifier);const calls:unknown[]=[];
    const service={
      list(userId:unknown){calls.push(['list',userId]);return call.connections??[];},
      get(userId:unknown,agentId:unknown){calls.push(['get',userId,agentId]);return call.connection??null;},
      publicBaseUrl(){calls.push(['baseUrl']);return 'https://gateway.fixture';},
      webhookSecret(userId:unknown,agentId:unknown){calls.push(['webhookSecret',userId,agentId]);return call.webhookSecret??null;},
      async testConnection(userId:unknown,agentId:unknown){calls.push(['test',userId,agentId]);if(call.error)throw new Error(call.error);return call.testResult??{ok:true};},
      async resolveAgentGithubEnv(userId:unknown,agentId:unknown){calls.push(['env',userId,agentId]);if(call.error)throw new Error(call.error);return call.env??null;}
    };
    const deps:any={service(){calls.push(['service']);return service;}};
    if(call.currentAgentId!==undefined)deps.currentAgentId=(context:unknown)=>{calls.push(['identity',context]);return call.currentAgentId;};
    const tool=call.token?subject.createAgentGithubTokenTool(deps):subject.createAgentGithubTool(deps);
    return {result:await tool.execute(call.input??{},call.context??{userId:'owner',threadId:'thread'}),calls};
  }
  if (call.op === 'sourcereview.maintenanceService') {
    const {mock}=await import('bun:test');const childProcess=await import('node:child_process');
    const fs=await import('node:fs/promises'),path=await import('node:path');
    const artifacts=path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts');await fs.mkdir(artifacts,{recursive:true});
    const directory=await fs.mkdtemp(path.join(artifacts,'maintenance-review-'));
    const commands:unknown[]=[],writes:unknown[]=[],plans:any[]=[];
    const repo={id:'repo',name:'Fixture Repo',localPath:directory};
    const log=console.error;console.error=()=>{};
    mock.module('node:child_process',()=>({...childProcess,execSync(command:string,options:any){
      commands.push({command,ownedCwd:options.cwd===directory,timeout:options.timeout,encoding:options.encoding,maxBuffer:options.maxBuffer,ci:options.env.CI,color:options.env.FORCE_COLOR,windowsHide:options.windowsHide});
      const result=(call.outputs??{})[command];
      if(result?.error)throw new Error(result.error);
      if(result?.failure)throw {stdout:result.stdout??'',stderr:result.stderr??'',status:1};
      return result?.stdout??'passed\n';
    }}));
    const database={insert(){return{values(value:any){writes.push({op:'insert',status:value.status,triggeredBy:value.triggeredBy});return{run(){}};}};},
      update(){return{set(value:any){writes.push({op:'update',status:value.status,output:value.output?.replace(/\d+ms/g,'$MS'),error:value.error,hasPlan:value.planId!==null,completed:typeof value.completedAt==='string'});return{where(){return{run(){}};}};}};},
      select(){return{from(){return{where(){return{get(){return call.row??null;},orderBy(){return{limit(){return{all(){return call.rows??[];}};}};}};},orderBy(){return{limit(){return{all(){return call.rows??[];}};}};}};}};}};
    const repos={getById(_id:string){return call.missing?null:call.inaccessible?{...repo,localPath:path.join(directory,'missing')}:repo;},list(){return[repo];}};
    const planService={create(value:any){plans.push({repoId:value.repoId,tasks:value.tasks.map((t:any)=>({title:t.title,description:t.description,status:t.status}))});return{id:'plan-fixture'};}};
    try{
      const subject=await import(specifier);const service=new subject.MaintenanceService(database,planService,repos);
      let result:unknown;
      try {
        if(call.action==='list')result=service.listRuns(call.jobId,call.limit);
        else if(call.action==='get')result=service.getRun('run');
        else {const value=await service.runForRepo('repo','job',call.config??{checks:[{name:'Check',command:'check'}]});
          result={repoId:value.repoId,repoName:value.repoName,allPassed:value.allPassed,planId:value.planId??null,checks:value.checks.map((c:any)=>({name:c.name,command:c.command,passed:c.passed,output:c.output,durationValid:Number.isFinite(c.durationMs)&&c.durationMs>=0}))};}
      }catch(error){result={error:(error as Error).message.replaceAll(directory,'$ROOT')};}
      return{result,commands,writes,plans};
    }finally{mock.restore();console.error=log;await fs.rm(directory,{recursive:true,force:true});}
  }
  if (call.op === 'sourcereview.networkScanHelpers') {
    const subject=await import(specifier);
    if(call.method==='candidates') {const values=subject.buildSubnetCandidates(call.input);return {length:values.length,values:call.indices.map((index:number)=>values[index]??null)};}
    const methods:Record<string,string>={arp:'parseArpTable',prefix:'normalizeSubnetPrefix',ipv4:'isValidIpv4',ips:'normalizeIps',merge:'mergeEntries'};
    if(!Object.hasOwn(methods,call.method))throw new Error('unknown pure network helper');
    return subject[methods[call.method]!](call.input);
  }
  if (call.op === 'sourcereview.jaitModels') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const boundary=(path:string)=>new URL(path,new URL('../../../', import.meta.url)).pathname;
    const methods:any={};for(const name of ['fetchOpenAIModels','fetchOpenRouterModels','fetchOllamaModels','fetchOmniRouteModels'])methods[name]=async(...args:unknown[])=>{calls.push([name,...args.map(x=>x??null)]);if((call.fail??[]).includes(name))throw new Error('fixture fetch failed');return call.models?.[name]??[];};
    mock.module(boundary('packages/gateway/src/providers/model-fetchers.ts'),()=>methods);mock.module(boundary('packages/gateway/src/providers/jait-provider.ts'),()=>({OPENROUTER_MODELS:[{id:'router-fallback',name:'Router Fallback',description:'Static router',isDefault:true}]}));
    try{const subject=await import(specifier);const result=await subject.listJaitModels({config:call.config??{},apiKeys:call.apiKeys,fallbackModels:call.fallbackModels??[{id:'fallback',name:'Fallback',isDefault:true}],...(call.includeCloud===undefined?{}:{includeCloud:call.includeCloud})});return {result,calls};}finally{mock.restore();}
  }
  if (call.op === 'sourcereview.metaTools') {
    const subject=await import(specifier);const calls:unknown[]=[];const all=call.tools??[];const visible=all.filter((t:any)=>!(call.hidden??[]).includes(t.name));const apiKeys={FIXTURE_KEY:'fixture-key'};
    const registry={listInfo(){calls.push(['listInfo']);return all;},listForMcp(){calls.push(['listForMcp']);return visible;},async rankSearchWithSystemOne(query:unknown,options:any,keys:unknown){calls.push(['rank',query,{limit:options.limit,...(options.candidates?{candidates:options.candidates.map((t:any)=>t.name)}:{})},keys===apiKeys]);if(call.rankError)throw new Error('fixture rank failed');return (call.ranks??[]).map((r:any)=>({tool:all[r.index],score:r.score,matchedTerms:r.terms}));}};
    const tool=subject[call.action==='list'?'createToolsListTool':'createToolsSearchTool'](registry);
    if(call.action==='metadata')return ['createToolsListTool','createToolsSearchTool'].map(name=>{const t=subject[name](registry);return {name:t.name,tier:t.tier,category:t.category,source:t.source,required:t.parameters.required};});
    try{return {result:await tool.execute(call.input??{},{requestedBy:call.mcp?'mcp-client':'jait',apiKeys}),calls};}catch(error){return {error:(error as Error).message,calls};}
  }
  if (call.op === 'sourcereview.liveView') {
    const {mock}=await import('bun:test');const calls:unknown[]=[],pending:Array<{options:any,resolve:(v:unknown)=>void,reject:(e:Error)=>void}>=[];let port=20000;const previous=process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;if(call.limit===undefined)delete process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;else process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS=call.limit;
    class Sandbox {async startBrowserSandbox(options:any){calls.push(['start',options]);return new Promise((resolve,reject)=>pending.push({options,resolve,reject}));}async stopContainer(name:string){calls.push(['stop',name]);if(call.stopError)throw new Error('fixture stop failed');}}
    mock.module(new URL('packages/gateway/src/security/sandbox-manager.ts',new URL('../../../', import.meta.url)).pathname,()=>({SandboxManager:Sandbox,async reserveLocalPort(){return ++port;}}));
    try{const subject=await import(specifier);
      if(call.action==='stop'){const session=call.host?{kind:'host',processes:[1,2,3].map(id=>({kill(){calls.push(['kill',id]);if(id===2)throw new Error('fixture kill failed');}}))}:{kind:'container',containerName:'fixture-container',processes:[]};await subject.stopLiveView(session);await subject.stopLiveView(session);return {calls,remaining:session.processes.length};}
      const waves:number[][]=[];let finished=0,serial=0;const promises=Array.from({length:call.count??1},(_,i)=>subject.startLiveView({projectRoot:call.defaultRoot?undefined:'/fixture/'+i}).then((value:unknown)=>{finished++;return value;},(e:Error)=>{finished++;return {error:e.message};}));
      for(let guard=0;finished<promises.length&&guard<12;guard++){for(let i=0;i<20;i++)await Promise.resolve();if(!pending.length)throw new Error('fixture live-view queue stalled');const current=pending.splice(0);waves.push(current.map(x=>x.options.novncPort));for(const p of current){const id=++serial;if(call.failFirst&&id===1)p.reject(new Error('fixture container failed'));else p.resolve({containerName:'fixture-'+id,vncPort:p.options.vncPort,novncPort:p.options.novncPort,novncUrl:'ws://fixture/'+id,cdpUrl:'http://fixture/'+id});}for(let i=0;i<20;i++)await Promise.resolve();}
      return {sessions:await Promise.all(promises),waves,calls:JSON.parse(JSON.stringify(calls).replaceAll(process.cwd(),'$CWD'))};
    }finally{if(previous===undefined)delete process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;else process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS=previous;mock.restore();}
  }
  if (call.op === 'sourcereview.ptyClient') {
    const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');const calls:unknown[]=[],events:unknown[]=[],logs:unknown[]=[];const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout,log=console.log;const timers=new Map<number,{fn:()=>void,ms:number}>();let id=0;
    globalThis.setTimeout=((fn:()=>void,ms:number)=>{const timer=++id;timers.set(timer,{fn,ms});return timer;}) as any;globalThis.clearTimeout=((timer:number)=>{timers.delete(timer);}) as any;console.log=(...args:unknown[])=>{logs.push(args);};
    const proc:any=new EventEmitter();proc.stdout=new PassThrough();proc.stderr=new PassThrough();proc.stdin={write(text:string){const payload=JSON.parse(text);calls.push(['rpc',payload]);if(!call.hold)queueMicrotask(()=>proc.stdout.write(JSON.stringify({id:payload.id,ok:!call.rpcError,...(call.rpcError?{error:call.detail}:{}),ptyId:'pty-fixture',pid:321})+'\n'));}};proc.kill=(signal:string)=>{calls.push(['kill',signal]);return true;};
    const launch=(command:string,args:string[],options:unknown)=>{calls.push(['launch',command,args.map(a=>a.split('/').at(-1)),options]);queueMicrotask(()=>{if(call.startTimeout){for(const [timer,t]of timers){if(t.ms===10000){timers.delete(timer);t.fn();}}}else proc.stderr.write('noise\npty-broker ready\n');});return proc;};
    let client:any;
    try{const subject=await import(specifier);client=new subject.PtyBrokerClient(launch);client.onOutput=(...args:unknown[])=>events.push(['output',...args]);client.onExit=(...args:unknown[])=>events.push(['exit',...args]);
      let result:unknown;
      try{const before=client.isReady;await client.start();const ready=client.isReady;
        if(call.action==='events'){proc.stdout.write('invalid JSON\n'+JSON.stringify({event:'output',ptyId:'a',data:''})+'\n'+JSON.stringify({event:'exit',ptyId:'a'})+'\n'+JSON.stringify({event:'output',ptyId:'b',data:'hello'})+'\n'+JSON.stringify({event:'exit',ptyId:'b',exitCode:0,signal:15})+'\n'+JSON.stringify({id:999,ok:true})+'\n'+JSON.stringify({event:'output',data:'ignored'})+'\n');result={before,ready};}
        else if(call.action==='stopPending'){const pending=[client.write('a','hello'),client.resize('b',80,24)].map((p:Promise<void>)=>p.catch((e:Error)=>e.message));await client.stop();result={before,ready,pending:await Promise.all(pending)};}
        else {const method=call.action??'spawn';const args=method==='spawn'?[call.options??{}]:method==='write'?['a','hello\nworld']:method==='resize'?['a',80,24]:['a'];const pending=client[method](...args);if(call.hold)for(const [timer,t]of timers){if(t.ms===15000){timers.delete(timer);t.fn();}}result={before,ready,value:(await pending)??null};}
      }catch(error){result={error:(error as Error).message};}
      await client.stop();return {result,calls,events,logs,readyAfter:client.isReady,pendingTimers:timers.size};
    }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;console.log=log;}
  }

  if (call.op === 'sourcereview.gmail' || call.op === 'sourcereview.outlook') {
    const subject=await import(specifier);const requests:unknown[]=[];let reads=0;const oldFetch=globalThis.fetch;const responses=[...(call.responses??[])];
    globalThis.fetch=Object.assign(async(raw:unknown,options:any={})=>{const url=new URL(String(raw));let body=options.body?JSON.parse(options.body):null;if(body?.raw)body={...body,raw:Buffer.from(body.raw,'base64url').toString('utf8')};requests.push({origin:url.origin,path:url.pathname,query:[...url.searchParams],method:options.method??'GET',headers:options.headers,body});const response=responses.shift();if(!response)throw new Error('Unexpected fixture fetch');if(response.fail)throw new Error('fixture fetch failed');const status=response.status??200;return {status,ok:status>=200&&status<300,async text(){reads++;return response.raw??JSON.stringify(response.body??{});}}as any;},{preconnect:oldFetch.preconnect});
    try{const client=new subject[call.module==='gmail'?'GmailClient':'OutlookClient']();const method=call.action??'listMessages';const args=method==='listMessages'?[call.options??{}]:method==='sendMessage'?[call.input]:method==='tagMessage'?[call.id??'message',call.add??[],call.remove??[]]:['getMessage','deleteMessage'].includes(method)?[call.id??'message']:[];try{return {value:(await client[method]('fixture-access-token',...args))??null,requests,reads,unused:responses.length};}catch(error){return {error:(error as Error).name==='SyntaxError'?'SyntaxError':(error as Error).message,requests,reads,unused:responses.length};}}
    finally{globalThis.fetch=oldFetch;}
  }
  if (call.op === 'sourcereview.imap') {
    const {mock}=await import('bun:test');const {EventEmitter}=await import('node:events');const calls:unknown[]=[];const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;let timerId=0;const timers=new Set<number>();globalThis.setTimeout=((_fn:()=>void,ms:number)=>{calls.push(['timer',ms]);const id=++timerId;timers.add(id);return id;})as any;globalThis.clearTimeout=((id:number)=>{timers.delete(id);})as any;
    const config={email:'alice@example.com',displayName:'Alice',imap:{host:'imap.example.com',port:993,secure:!call.startTLS,user:'alice',password:'fixture-password'},smtp:{host:'smtp.example.com',port:587,secure:!!call.smtpSecure,user:'alice',password:'fixture-password'}};
    const record=(name:string,args:unknown[])=>{calls.push([name,...args]);if(call.fail===name)throw new Error('fixture '+name+' failed');};
    class Client extends EventEmitter {mailbox:any;fetches=0;constructor(options:unknown){super();record('new',[options]);}override on(name:string,fn:(...args:any[])=>void){record('on',[name]);return super.on(name,fn);}async connect(){record('connect',[]);this.emit('error',new Error('fixture observed error'));}close(){record('close',[]);}async getMailboxLock(folder:string,options:unknown){record('lock',[folder,options??null]);this.mailbox=call.noMailbox?false:{path:folder,uidValidity:call.validity??12,exists:call.exists??3};return {release(){record('release',[]);}};}async search(...args:unknown[]){record('search',args);return call.ids??[1,2,3];}async fetchAll(...args:unknown[]){record('fetchAll',args);return (call.items??[]).map((item:any)=>({...item,flags:new Set(item.flags??[]),envelope:{...item.envelope,...(item.date?{date:new Date(item.date)}:{})}}));}async fetchOne(...args:unknown[]){record('fetchOne',args);if(++this.fetches===1)return call.info===undefined?{size:123}:call.info;if(call.data===false)return false;return {uid:2,flags:new Set(),envelope:{subject:'Original',from:[{name:'Bob',address:'bob@example.com'}]},...call.data,...(call.noSource?{}:{source:Buffer.from('fixture MIME')})};}async list(){record('list',[]);return call.folders??[];}async messageFlagsAdd(...args:unknown[]){record('flagsAdd',args);}async messageFlagsRemove(...args:unknown[]){record('flagsRemove',args);}async messageMove(...args:unknown[]){record('move',args);}}
    const transport={async verify(){record('verify',[]);},async sendMail(input:unknown){record('sendMail',[input]);return {messageId:'sent-message'};},close(){record('transportClose',[]);}};
    mock.module('imapflow',()=>({ImapFlow:Client}));mock.module('nodemailer',()=>({default:{createTransport(options:unknown){record('transport',[options]);return transport;}}}));mock.module('mailparser',()=>({async simpleParser(input:Buffer,options:unknown){record('parse',[input.toString('utf8'),options]);return {text:'Message text',html:false,attachments:[],...call.parsed};}}));
    mock.module(new URL('packages/gateway/src/services/email/connection.ts',new URL('../../../', import.meta.url)).pathname,()=>({async publicMailServer(server:any){record('resolve',[server]);return {...server,host:'93.184.216.34',servername:server.host};}}));
    try{const subject=await import(specifier);if(call.action==='parse'){try{return {value:subject.parseImapMessageId(call.raw??Buffer.from(JSON.stringify(call.idData)).toString('base64url'))};}catch(error){return {error:(error as Error).message};}}
      const client=new subject.ImapMailboxClient(config);const id=call.id??Buffer.from(JSON.stringify(['INBOX','12',2])).toString('base64url');const method=call.action??'listMessages';const args=method==='listMessages'?[call.options??{}]:method==='sendMessage'?[{...call.input,...(call.reply?{replyToMessageId:id}:{})}]:method==='tagMessage'?[id,call.add??[],call.remove??[]]:['getMessage','deleteMessage'].includes(method)?[id]:[];
      try{return {value:(await client[method]('unused-token',...args))??null,calls,pendingTimers:timers.size};}catch(error){return {error:(error as Error).message,calls,pendingTimers:timers.size};}
    }finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;mock.restore();}
  }

  if (call.op === 'sourcereview.config') {
    const subject=await import(specifier);
    if(call.action==='infer')return call.models.map((model:string)=>subject.inferContextWindow(model));
    const names=['PORT','WS_PORT','HOST','LOG_LEVEL','CORS_ORIGIN','NODE_ENV','JWT_SECRET','HOOK_SECRET','LLM_PROVIDER','OLLAMA_URL','OLLAMA_MODEL','OPENAI_API_KEY','OPENAI_MODEL','OPENAI_BASE_URL','OMNIROUTE_BASE_URL','OMNIROUTE_API_KEY','CONTEXT_WINDOW','JAIT_MAX_ROUNDS','OLLAMA_CONTEXT_LENGTH','HEARTBEAT_CRON','WHISPER_URL','OPENAI_REALTIME_MODEL','OPENAI_REALTIME_VOICE','JAIT_STT_PROMPT','JAIT_PRIMARY_GATEWAY','JAIT_PRIMARY_TOKEN','JAIT_NODE_NAME','WINDOWS_SSH_USERNAME','WINDOWS_SSH_PASSWORD','JAIT_NODE_ONLY'];const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
    try{for(const name of names)delete process.env[name];Object.assign(process.env,call.env??{});const first=subject.loadConfig(),second=subject.loadConfig();const normalize=(value:string,supplied:unknown)=>supplied?value:/^[a-f0-9]{64}$/.test(value)?'GENERATED_SECRET':'INVALID_SECRET';return {config:{...first,jwtSecret:normalize(first.jwtSecret,call.env?.JWT_SECRET?.trim()),hookSecret:normalize(first.hookSecret,call.env?.HOOK_SECRET?.trim())},stableSecrets:first.jwtSecret===second.jwtSecret&&first.hookSecret===second.hookSecret};}
    finally{for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
  if (call.op === 'sourcereview.safeUpdate') {
    const subject=await import(specifier);const fs=await import('node:fs/promises');const rootBase=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;await fs.mkdir(rootBase,{recursive:true});const root=await fs.mkdtemp(join(rootBase,'safe-update-'));const calls:unknown[]=[];
    const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(root,'$ROOT').replaceAll(process.execPath,'$EXEC').replaceAll(/\.jait-update-[^/"\s]+/g,'.jait-update-STAGE'));
    const packageTree=async(dir:string,version:string,invalid?:string)=>{await fs.mkdir(join(dir,'bin'),{recursive:true});await fs.mkdir(join(dir,'dist'),{recursive:true});await fs.mkdir(join(dir,'web-dist'),{recursive:true});await fs.mkdir(join(dir,'node_modules/@fixture/dep'),{recursive:true});await fs.writeFile(join(dir,'package.json'),JSON.stringify({name:invalid==='name'?'not-gateway':'@jait/gateway',version:invalid==='version'?'invalid':version,dependencies:{'@fixture/dep':'1.0.0'}}));await fs.writeFile(join(dir,'node_modules/@fixture/dep/package.json'),JSON.stringify({name:invalid==='dependency'?'wrong':'@fixture/dep'}));await fs.writeFile(join(dir,'bin/jait.mjs'),'// fixture CLI\n');await fs.writeFile(join(dir,'dist/index.js'),'// fixture gateway\n');if(invalid!=='entry')await fs.writeFile(join(dir,'web-dist/index.html'),'fixture web');};
    const live=join(root,'live');await packageTree(live,'1.0.0');
    const runCommand=async(command:string,args:string[],options?:unknown)=>{calls.push(['run',command,args,options??null]);const phase=args[0]==='install'?'install':args[0]==='--check'?'check':'version';if(call.fail===phase)throw new Error('fixture '+phase+' failed');if(phase==='install'){const prefix=args[args.indexOf('--prefix')+1]!;await packageTree(join(prefix,process.platform==='win32'?'node_modules':'lib/node_modules','@jait/gateway'),'2.0.0',call.invalid);}return {stdout:'fixture',stderr:''};};
    try{
      if(call.action==='wait'){const oldFetch=globalThis.fetch,oldNow=Date.now,oldSet=globalThis.setTimeout;let now=0,index=0;Date.now=()=>now;globalThis.setTimeout=((fn:()=>void,ms:number)=>{now+=ms;queueMicrotask(fn);return 1;})as any;globalThis.fetch=Object.assign(async(url:unknown,options:any)=>{calls.push(['fetch',url,{signalPresent:options.signal instanceof AbortSignal}]);const response=call.health[index++]??{};if(response.networkError)throw new Error('fixture network failed');return {ok:response.ok!==false,async json(){if(response.jsonError)throw new Error('fixture JSON failed');return response;}}as any;},{preconnect:oldFetch.preconnect});try{await subject.waitForVersion(32123,'2.0.0',call.timeout??5000);return {value:null,calls};}catch(error){return {error:(error as Error).message,calls};}finally{globalThis.fetch=oldFetch;Date.now=oldNow;globalThis.setTimeout=oldSet;}}
      if(call.action==='validate'){await packageTree(join(root,'candidate'),'2.0.0',call.invalid);try{return normalize({value:await subject.validatePackage(join(root,'candidate'),runCommand),calls});}catch(error){return normalize({error:(error as any).code??(error as Error).message,calls});}}
      if(call.action==='prepare'){if(call.locked)await fs.mkdir(live+'.update-lock');try{const plan=await subject.prepareUpdate({live,version:call.version??'latest',runCommand});const owner=JSON.parse(await fs.readFile(join(plan.lock,'owner.json'),'utf8'));const saved=JSON.parse(await fs.readFile(join(plan.stage,'plan.json'),'utf8'));const output=normalize({plan,calls,planSaved:JSON.stringify(saved)===JSON.stringify(plan),ownerValid:owner.pid===process.pid&&/^\d{4}-\d\d-\d\dT/.test(owner.startedAt),controllerCopied:(await fs.readFile(join(plan.stage,'safe-update.mjs'),'utf8'))===readFileSync(new URL(specifier,import.meta.url),'utf8')});const value=JSON.parse(JSON.stringify(output).replaceAll(/\.jait-update-[^/"\s]+/g,'.jait-update-STAGE'));await subject.discardUpdate(plan);return {...value,remaining:(await fs.readdir(root)).sort()};}catch(error){return normalize({error:(error as any).code??(error as Error).message,calls,remaining:(await fs.readdir(root)).sort()});}}
      const stage=join(root,'stage'),candidate=join(stage,'candidate'),lock=live+'.update-lock';await fs.mkdir(lock);await packageTree(candidate,'2.0.0');const plan={live,stage,candidate,lock,backup:join(stage,'previous'),newVersion:'2.0.0',previousVersion:'1.0.0'};let starts=0,stops=0;
      const stop=async()=>{calls.push(['stop']);if(call.fail==='stop'&&++stops===1)throw new Error('fixture stop failed');};
      const restart=async()=>{calls.push(['restart',JSON.parse(await fs.readFile(join(live,'package.json'),'utf8')).version]);if(call.fail==='restart'&&++starts===1)throw new Error('fixture restart failed');};
      const health=async(port:number,version:string)=>{calls.push(['health',port,version]);if(call.fail==='health'&&version==='2.0.0')throw new Error('fixture health failed');};
      let error:string|null=null;try{await subject.activateUpdate(plan,{stop,...(call.noRestart?{}:{restart}),health,port:32123});}catch(e){error=(e as Error).message;}
      const exists=async(p:string)=>fs.access(p).then(()=>true,()=>false);return normalize({error,calls,current:JSON.parse(await fs.readFile(join(live,'package.json'),'utf8')).version,backup:await exists(plan.backup),candidate:await exists(candidate),failed:await exists(join(stage,'failed')),lock:await exists(lock),result:JSON.parse(await fs.readFile(join(stage,'result.json'),'utf8'))});
    }finally{await fs.rm(root,{recursive:true,force:true});}
  }

  if (call.op === 'sourcereview.entry') {
    const fs=await import('node:fs/promises');const {spawnSync}=await import('node:child_process');const base=new URL('.jait/artifacts/source-review/',new URL('../../../', import.meta.url)).pathname;await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(join(base,'entrypoint-'));const runner=join(root,'runner.mjs');
    const script=String.raw`
import vm from 'node:vm';import * as fs from 'node:fs';import * as path from 'node:path';import * as crypto from 'node:crypto';import {EventEmitter}from'node:events';import {pathToFileURL}from'node:url';
let raw='';for await(const chunk of process.stdin)raw+=chunk;const {call,subject,root}=JSON.parse(raw);const state=path.join(root,'state');const calls=[],output=[],stderr=[],timers=[],processes=[];const events=new EventEmitter(),control=new EventEmitter();let exits=[];
const fake={argv:['node',subject,call.relative?'relative-state':state,call.port??'32123',call.network??'local'],env:{FIXTURE:'literal $value'},pid:12345,stdout:{write:text=>output.push(text)},stderr:{write:text=>stderr.push(text)},stdin:{},cwd:()=>'/fixture/cwd',chdir:p=>calls.push(['chdir',p]),on:(name,fn)=>events.on(name,fn),emit:(name,...args)=>{calls.push(['emit',name]);return events.emit(name,...args);},exit:code=>exits.push(code),kill:(pid,signal)=>{calls.push(['probe',pid,signal]);if(!call.activeLock)throw Object.assign(new Error('stale'),{code:'ESRCH'});}};
const pty={spawn:(shell,args,options)=>{calls.push(['spawn',shell,args,options]);if(call.spawnError)throw new Error('fixture PTY failed');const index=processes.length;const proc={pid:300+index,onData:fn=>{proc.data=fn;},onExit:fn=>{proc.exit=fn;},write:data=>{calls.push(['write',index,data]);if(call.writeError)throw new Error('fixture write failed');},resize:(cols,rows)=>calls.push(['resize',index,cols,rows]),kill:()=>{calls.push(['kill',index]);if(call.killError)throw new Error('fixture kill failed');}};processes.push(proc);return proc;}};
const context=vm.createContext({process:fake,console:{error:(...args)=>calls.push(['consoleError',...args.map(x=>x instanceof Error?x.message:String(x))])},setTimeout:(fn,ms)=>{timers.push({fn,ms});return {unref(){calls.push(['unref',ms]);}};}});
const synthetic=async(exports,identifier)=>{const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context,identifier});await m.link(()=>{});await m.evaluate();return m;};
const module=new vm.SourceTextModule(fs.readFileSync(subject,'utf8'),{context,identifier:pathToFileURL(subject).href,initializeImportMeta(meta){meta.url=pathToFileURL(subject).href;},async importModuleDynamically(spec){calls.push(['import',spec.split('/').at(-1)]);if(spec.endsWith('compile-cache.mjs'))return synthetic({},'cache');if(spec.endsWith('index.js'))return synthetic({main:async()=>{calls.push(['main']);if(call.earlyStop)control.emit('close');if(call.mainError)throw new Error('fixture main failed');}},'gateway');throw new Error('Unexpected fixture import');}});
let error=null;
try{
 if(call.module==='desktopEntry'&&(call.oldLock!==undefined||call.secrets!==undefined)){fs.mkdirSync(state,{recursive:true,mode:0o700});if(call.oldLock!==undefined)fs.writeFileSync(path.join(state,'desktop-host.pid'),call.oldLock);if(call.secrets!==undefined)fs.writeFileSync(path.join(state,'host-secrets.json'),typeof call.secrets==='string'?call.secrets:JSON.stringify(call.secrets),{mode:0o600});}
 await module.link(async(spec)=>{if(spec==='node:fs')return synthetic(fs,'fs');if(spec==='node:path')return synthetic(path,'path');if(spec==='node:crypto')return synthetic(crypto,'crypto');if(spec==='node:readline')return synthetic({createInterface:()=>control},'readline');if(spec==='node:module')return synthetic({createRequire:()=>name=>{if(name!=='node-pty')throw new Error('Unexpected fixture require');return pty;}},'module');throw new Error('Unexpected static fixture import');});await module.evaluate();
 for(const action of call.actions??[]){if(action.kind==='line')control.emit('line',typeof action.value==='string'?action.value:JSON.stringify(action.value));else if(action.kind==='data')processes[action.index??0].data(action.data);else if(action.kind==='exit')processes[action.index??0].exit({exitCode:action.exitCode,signal:action.signal});else if(action.kind==='signal')fake.emit(action.signal);else if(action.kind==='close')control.emit('close');else if(action.kind==='timer')for(const t of [...timers])t.fn();}
}catch(e){error=e.name==='SyntaxError'?'SyntaxError':e.message;}
const normalize=x=>JSON.parse(JSON.stringify(x).replaceAll(state,'$STATE').replaceAll(root,'$ROOT'));
if(call.module==='ptyEntry'){process.stdout.write(JSON.stringify({error,calls,output:output.map(x=>JSON.parse(x)),stderr,exits}));}
else{let secrets;try{secrets=JSON.parse(fs.readFileSync(path.join(state,'host-secrets.json'),'utf8'));}catch{}const lockPath=path.join(state,'desktop-host.pid');const hasLock=fs.existsSync(lockPath);let lock=hasLock?fs.readFileSync(lockPath,'utf8'):null;const valid=secrets&&/^[a-f0-9]{64}$/.test(secrets.jwt)&&/^[a-f0-9]{64}$/.test(secrets.hook);const env={...fake.env};if('JWT_SECRET'in env)env.JWT_SECRET='SYNTHETIC_SECRET';if('HOOK_SECRET'in env)env.HOOK_SECRET='SYNTHETIC_SECRET';const stateMode=fs.existsSync(state)?fs.statSync(state).mode&0o777:null;const secretMode=fs.existsSync(path.join(state,'host-secrets.json'))?fs.statSync(path.join(state,'host-secrets.json')).mode&0o777:null;const match=!!(secrets&&fake.env.JWT_SECRET===secrets.jwt&&fake.env.HOOK_SECRET===secrets.hook);events.emit('exit');process.stdout.write(JSON.stringify(normalize({error,calls,output,exits,env,stateMode,secretMode,secretsValid:!!valid,secretsInEnvMatch:match,lock,lockAfterExit:fs.existsSync(lockPath),timers:timers.map(t=>t.ms)})));}
`;
    try{await fs.writeFile(runner,script);const result=spawnSync('node',['--experimental-vm-modules',runner],{input:JSON.stringify({call,subject:new URL(specifier,import.meta.url).pathname,root}),encoding:'utf8',timeout:8000,maxBuffer:256*1024,env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'}});if(result.status!==0)throw new Error('Entry fixture setup failed: '+result.stderr);return JSON.parse(result.stdout);}finally{await fs.rm(root,{recursive:true,force:true});}
  }

  if (call.op === 'sourcereview.agentControl') {
    const {Database}=await import('bun:sqlite');const {drizzle}=await import('../../../packages/gateway/node_modules/drizzle-orm/bun-sqlite/index.js');const sqlite=new Database(':memory:');sqlite.exec('CREATE TABLE agent_control (user_id TEXT PRIMARY KEY, halted INTEGER NOT NULL DEFAULT 0, reason TEXT, halted_at TEXT, updated_at TEXT NOT NULL)');const db=drizzle(sqlite);const subject=await import(specifier);const calls:unknown[]=[],results:unknown[]=[];let now=1700000000000;const OriginalDate=Date;globalThis.Date=class extends OriginalDate{constructor(value?:string|number){super(value??now);}static now(){return now;}}as DateConstructor;
    for(const row of call.rows??[])sqlite.query('INSERT INTO agent_control VALUES (?, ?, ?, ?, ?)').run(row.userId,row.halted?1:0,row.reason??null,row.haltedAt??null,row.updatedAt??'seed');
    if(call.failWrite)sqlite.exec("CREATE TRIGGER refuse_control BEFORE INSERT ON agent_control BEGIN SELECT RAISE(ABORT, 'fixture write failed'); END");
    let service:any;const hooks=call.noHooks?{}:{stopRunning(user:string){calls.push(['stop',user,service.isHalted(user)]);if(call.stopError)throw call.primitive?'fixture stop failed':new Error('fixture stop failed');return call.stopResult??2;},onChange(change:unknown){calls.push(['change',structuredClone(change)]);if(call.changeError)throw new Error('fixture change failed');}};
    try{service=new subject.AgentControlService(db,hooks);
      if(call.action==='helpers'){const error=new subject.AgentHaltedError(undefined,'dispatch');return {code:subject.AGENT_HALTED_CODE,running:subject.RUNNING_STATE,error:{name:error.name,message:error.message,code:error.code,action:error.action},recognition:[error,{code:'agent_halted'},{code:'other'},null,'agent_halted',42].map(x=>subject.isAgentHaltedError(x)),body:subject.agentHaltedBody(call.state??subject.RUNNING_STATE,call.bodyAction)};}
      for(const step of call.steps??[]){if(step.kind==='time'){now=step.now;continue;}try{if(step.kind==='state')results.push(service.getState(step.user??'owner'));else if(step.kind==='predicate')results.push(service.isHalted(step.user??'owner'));else if(step.kind==='halt')results.push(await service.halt(step.user??'owner',{reason:step.reason}));else if(step.kind==='resume')results.push(service.resume(step.user??'owner'));else if(step.kind==='assert'){service.assertCanRun(step.user??'owner',step.action);results.push(null);}else if(step.kind==='copy'){service.getState('').halted=true;results.push(service.getState(''));}}catch(error){const e=error as any;results.push({error:e.cause?.message??e.message,name:e.cause?'DatabaseError':e.name,...(e.code?{code:e.code}:{}),...(e.action?{action:e.action}:{})});}}
      return {results,calls,rows:sqlite.query('SELECT * FROM agent_control ORDER BY user_id').all()};
    }finally{globalThis.Date=OriginalDate;sqlite.close();}
  }
  if (call.op === 'sourcereview.attention') {
    const subject=await import(specifier);if(call.action==='policy')return call.surfaces.map((surface:string)=>subject.shouldNotifyNatively(surface,new Set(call.live??[])));if(call.action==='actions')return call.requests.map((request:unknown)=>subject.attentionActionsForQuestion(request));
    const OriginalDate=Date;let now=1700000000000;globalThis.Date=class extends OriginalDate{constructor(value?:string|number){super(value??now);}static now(){return now;}}as DateConstructor;const events:unknown[]=[],sinkEvents:unknown[]=[],resolutions:unknown[]=[],results:unknown[]=[];const surfaces:string[]=call.surfaces??['web','desktop','android'];const ws={liveSurfaces(user:unknown){events.push(['live',user]);return new Set(surfaces);},broadcastBySurface(user:unknown,create:(surface:string)=>unknown){events.push(['raised',user,surfaces.map(surface=>[surface,create(surface)])]);},broadcastToUser(user:unknown,event:unknown){events.push(['user',user,event]);},broadcastAll(event:unknown){events.push(['all',event]);}};const service=new subject.AttentionService(ws,call.noResolver?{}:{resolveUserId(session:string){resolutions.push(session);return call.resolvedUser??'owner';}});const unsubscribes:Array<()=>void>=[];
    try{for(let i=0;i<(call.sinks??['normal']).length;i++){const mode=(call.sinks??['normal'])[i];unsubscribes.push(service.addSink({raised(item:unknown){sinkEvents.push([i,'raised',structuredClone(item)]);if(mode==='throw')throw new Error('fixture sink failed');if(mode==='reject')return Promise.reject(new Error('fixture sink rejected'));},cleared(event:unknown){sinkEvents.push([i,'cleared',structuredClone(event)]);if(mode==='throw')throw new Error('fixture sink failed');if(mode==='reject')return Promise.reject(new Error('fixture sink rejected'));}}));}
      for(const step of call.steps??[]){if(step.kind==='raise')results.push(service.raise(step.item));else if(step.kind==='clear')results.push(service.clear(step.attentionKind??'question',step.requestId??'r1',step.reason??'answered',step.resolvedBy));else if(step.kind==='list')results.push(service.list(step.user??undefined));else if(step.kind==='get')results.push(service.get(step.key)??null);else if(step.kind==='unsubscribe'){unsubscribes[step.index??0]!();}else if(step.kind==='time')now=step.now;}
      await Promise.resolve();return {results,events,sinkEvents,resolutions};
    }finally{globalThis.Date=OriginalDate;}
  }
  if (call.op === 'sourcereview.mobilePush') {
    const subject=await import(specifier);if(call.action==='revoke')return subject.attentionRevokeTargets(call.registrations,call.resolvedBy??null);
    const {Database}=await import('bun:sqlite');const {drizzle}=await import('../../../packages/gateway/node_modules/drizzle-orm/bun-sqlite/index.js');const sqlite=new Database(':memory:');sqlite.exec('CREATE TABLE mobile_push_registrations (device_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token TEXT UNIQUE NOT NULL,platform TEXT NOT NULL,enabled INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_seen_at TEXT NOT NULL)');const db=drizzle(sqlite);const OriginalDate=Date;let now=1700000000000;globalThis.Date=class extends OriginalDate{constructor(value?:string|number){super(value??now);}static now(){return now;}}as DateConstructor;const requests:unknown[]=[],warnings:unknown[]=[],results:unknown[]=[];const oldWarn=console.warn,oldFetch=globalThis.fetch,oldEnv=process.env.JAIT_FIREBASE_SERVICE_ACCOUNT_JSON;console.warn=(...args:unknown[])=>warnings.push(args.slice(0,2).map(arg=>typeof arg==='string'?arg:'ERROR'));
    const crypto=await import('node:crypto');const pair=call.disabled?null:crypto.generateKeyPairSync('rsa',{modulusLength:2048});const account=pair?{project_id:'project /1',client_email:'fixture@example.invalid',private_key:pair.privateKey.export({format:'pem',type:'pkcs8'}).toString()}:null;const publicKey=pair?await jose.importSPKI(pair.publicKey.export({format:'pem',type:'spki'}).toString(),'RS256'):null;
    const fetchImpl=Object.assign(async(url:unknown,options:any)=>{if(String(url)==='https://oauth2.googleapis.com/token'){const form=new URLSearchParams(options.body),assertion=form.get('assertion')!;const verified=await jose.jwtVerify(assertion,publicKey!,{issuer:'fixture@example.invalid',audience:'https://oauth2.googleapis.com/token',currentDate:new OriginalDate(now)});requests.push({url,method:options.method,headers:options.headers,grant:form.get('grant_type'),jwt:verified.payload,header:verified.protectedHeader,signatureValid:true});return {ok:!call.oauthError,status:call.oauthError?401:200,async json(){return {access_token:'fixture-oauth-access',...(call.expiresIn===undefined?{}:{expires_in:call.expiresIn})};}}as any;}const body=JSON.parse(options.body);requests.push({url,method:options.method,headers:options.headers,body});const status=call.statuses?.[body.message.token]??200;return {ok:status>=200&&status<300,status,async text(){return call.errorBody??'fixture denied';}}as any;},{preconnect:oldFetch.preconnect});
    try{for(const row of call.rows??[])sqlite.query('INSERT INTO mobile_push_registrations VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(row.deviceId,row.userId,row.token,'android',row.enabled??1,'seed','seed','seed');globalThis.fetch=fetchImpl;let service:any;if(call.environment!==undefined){if(call.environment===null)delete process.env.JAIT_FIREBASE_SERVICE_ACCOUNT_JSON;else process.env.JAIT_FIREBASE_SERVICE_ACCOUNT_JSON=call.environment==='valid'?JSON.stringify(account):call.environment;service=subject.MobilePushService.fromEnvironment(db);}else service=new subject.MobilePushService(db,account,fetchImpl);
      for(const step of call.steps??[]){try{if(step.kind==='time'){now=step.now;continue;}if(step.kind==='register')results.push(service.register(step.deviceId,step.user??'owner',step.token));else if(step.kind==='unregister')results.push(service.unregister(step.deviceId,step.user??'owner'));else if(step.kind==='list')results.push(service.list(step.user??'owner'));else if(step.kind==='attention')results.push((await service.sendAttention(step.item))??null);else if(step.kind==='cleared')results.push((await service.sendAttentionCleared(step.event))??null);else if(step.kind==='completed')results.push(await service.sendChatCompleted(step.user??'owner',step.notification));else if(step.kind==='read')results.push((await service.sendChatNotificationRead(step.user??'owner',step.state))??null);else if(step.kind==='alarm')results.push(await service.scheduleAlarm(step.user??'owner',step.alarm));}catch(error){results.push({error:(error as Error).message});}}
      requests.sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return {results,requests,warnings,rows:sqlite.query('SELECT * FROM mobile_push_registrations ORDER BY device_id').all()};
    }finally{globalThis.Date=OriginalDate;globalThis.fetch=oldFetch;console.warn=oldWarn;if(oldEnv===undefined)delete process.env.JAIT_FIREBASE_SERVICE_ACCOUNT_JSON;else process.env.JAIT_FIREBASE_SERVICE_ACCOUNT_JSON=oldEnv;sqlite.close();}
  }

  if (call.op === 'sourcereview.permissions') {
    const subject=await import(specifier);
    if(call.action==='glob')return call.pairs.map(([value,pattern]:string[])=>subject.matchGlob(value,pattern));
    if(call.action==='irreversible')return call.commands.map((command:string)=>subject.classifyIrreversibleCommand(command));
    if(call.action==='consent')return call.inputs.map((input:any)=>subject.requiresConsent(input.level===null?undefined:{toolName:'fixture.tool',consentLevel:input.level,risk:'high',description:'fixture'},input.trust,new Set(input.approved?['fixture.tool']:[])));
    if(call.action==='resolve'){const permissions=new Map((call.permissions??[]).map((permission:any)=>[permission.toolName,permission]));return call.names.map((name:string)=>subject.resolveToolPermission(name,permissions));}
    return call.inputs.map((input:any)=>subject[call.action==='path'?'isPathAllowedByPermission':'isCommandAllowed'](input.value,input.permission===null?undefined:{toolName:'fixture.tool',consentLevel:'always',risk:'high',description:'fixture',...input.permission}));
  }
  if (call.op === 'sourcereview.profiles') {
    const subject=await import(specifier);
    try{if(call.action==='unknown'){subject.getProfile(call.name);return {accepted:true};}
      if(call.action==='extend'){const map=subject.extendProfile(call.name,call.overrides);return {entries:call.inspect.map((name:string)=>map.get(name)??null),base:call.inspect.map((name:string)=>subject.getProfile(call.name).get(name)?.consentLevel??null)};}
      const map=subject.getProfile(call.name);const serialized=subject.serializeProfile(call.name);if(call.action==='independent'){map.delete('file.read');map.set('fixture.tool',call.permission);return {freshRead:subject.getProfile(call.name).has('file.read'),freshAdded:subject.getProfile(call.name).has('fixture.tool')};}
      return {profiles:subject.listProfiles(),name:serialized.name,names:[...map.keys()],selected:call.inspect.map((name:string)=>{const p=map.get(name);return p?{toolName:p.toolName,consentLevel:p.consentLevel,risk:p.risk,allowedCommands:p.allowedCommands??[],deniedCommands:p.deniedCommands??[]}:null;}),serializedNames:serialized.permissions.map((p:any)=>p.toolName),descriptionsValid:serialized.permissions.every((p:any)=>typeof p.description==='string'&&p.description.length>0)};
    }catch(error){return {error:(error as Error).message,name:(error as Error).name};}
  }

  if (call.op === 'sourcereview.crypto') {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const sentinel = { sentinel: true };
    try {
      if (call.present) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: sentinel });
      else Reflect.deleteProperty(globalThis, 'crypto');
      await import(specifier);
      return { present: typeof globalThis.crypto !== 'undefined', preserved: call.present ? (globalThis.crypto as unknown) === sentinel : null,
        random: typeof globalThis.crypto?.getRandomValues === 'function', installed: call.present ? null : globalThis.crypto === webcrypto };
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  }
  if (call.op === 'sourcereview.uuid') {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const now = Date.now;
    try {
      Date.now = () => call.now;
      if (call.fallback) Reflect.deleteProperty(globalThis, 'crypto');
      else Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(array: Uint8Array) { array.fill(call.byte); return array; } } });
      const m = await import(specifier);
      const value = m[call.action ? 'newActionId' : 'uuidv7']();
      return call.fallback ? { prefix: value.slice(0, 13), format: /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) } : value;
    } finally { Date.now = now; if (original) Object.defineProperty(globalThis, 'crypto', original); }
  }
  if (call.op === 'sourcereview.notificationGenerate') {
    const { mock } = await import('bun:test');
    const calls: unknown[] = [];
    // Only the external completion boundary is substituted; production request
    // construction, timeout cleanup, normalization and fallback stay intact.
    mock.module(new URL('packages/gateway/src/services/jait-llm.ts', new URL('../../../', import.meta.url)).pathname, () => ({
      async callJaitLlmCompletion(config: unknown, messages: unknown, options: any) {
        calls.push({ config, messages, maxTokens: options.maxTokens, temperature: options.temperature, aborted: options.signal.aborted });
        if (call.fail) throw new Error('fixture completion failed');
        return call.raw;
      },
    }));
    try {
      const subject = await import(specifier);
      const result = await subject.generateChatNotificationDetail({task:call.task, response:call.response, llm:{fixture:'runtime'}});
      return {result,calls};
    } finally { mock.restore(); }
  }
  if (call.op === 'sourcereview.agentWrapper') {
    const {mock}=await import('bun:test');
    const deps={fixture:'deps'},context={sessionId:'fixture',projectRoot:'fixture'},result={ok:true,message:'inner result'};
    let actualDeps:unknown,actualInput:unknown,actualContext:unknown;
    const calls:unknown[]=[];
    mock.module(new URL('packages/gateway/src/tools/agent-tools.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      createAgentSpawnTool(received:unknown){actualDeps=received;return {async execute(input:unknown,ctx:unknown){actualInput=input;actualContext=ctx;calls.push(input,ctx);if(call.fail)throw new Error('inner rejected');return result;}};}
    }));
    try{
      const subject=await import(specifier);const tool=subject.createAgentTool(deps);
      let returned,error;try{returned=await tool.execute(call.input,context);}catch(e){error=(e as Error).message;}
      return {name:tool.name,tier:tool.tier,category:tool.category,source:tool.source,required:tool.parameters.required,properties:Object.keys(tool.parameters.properties).sort(),depsIdentity:deps===actualDeps,inputIdentity:call.input===actualInput,contextIdentity:context===actualContext,calls,...(error?{error}:{resultIdentity:returned===result,result:returned})};
    }finally{mock.restore();}
  }
  if (call.op === 'sourcereview.decisionTool') {
    const {mock}=await import('bun:test');const calls:unknown[]=[];const signal=new AbortController().signal;
    mock.module(new URL('packages/gateway/src/services/system-one.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      async evaluateDecision(keys:unknown,state:unknown,questions:unknown,received:unknown){calls.push({keys,state,questions,sameSignal:received===signal});if(call.fail)throw new Error('decision failed');return call.response;}
    }));
    try{const subject=await import(specifier);return {result:await subject.createDecisionEvaluateTool().execute(call.input,{apiKeys:{fixture:'key'},signal}),calls};}finally{mock.restore();}
  }
  if(call.op==='sourcereview.script') {
    const fs=await import('node:fs');const path=await import('node:path');const cp=await import('node:child_process');
    const base=fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts/source-review','script-'));
    const node=nodeBinary,root=path.join(base,'project/packages/gateway'),home=path.join(base,'home'),bin=path.join(base,'bin');
    fs.mkdirSync(home,{recursive:true});fs.mkdirSync(bin);
    const env:NodeJS.ProcessEnv={PATH:bin,HOME:home,LANG:'C.UTF-8',__JAIT_CLI:'1'};
    const normalize=(text:string)=>text.replaceAll(base,'ROOT');
    const spawnNode=(args:string[],options:Record<string,unknown>)=>{const spawned=cp.spawnSync(node,args,options as never);if(spawned.error)throw new Error('fixture node spawn failed ('+node+'): '+spawned.error.message);return spawned;};
    try{
      const relative=call.module==='compileCacheScript'||call.module==='installRuntimeScript'?'bin/subject.mjs':'scripts/subject.mjs';
      const subject=path.join(root,relative);fs.mkdirSync(path.dirname(subject),{recursive:true});
      fs.writeFileSync(subject,fs.readFileSync(new URL(specifier,import.meta.url)));
      if (call.module === 'packageDesktopScript') {
        const project = path.join(base, 'project');
        const modules = path.join(project, 'node_modules');
        const writePackage = (dir: string, pkg: any) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg)); };
        const gateway = { name: '@jait-fixture/gateway', version: '9.8.7', files: ['dist', 'assets'], dependencies: { '@jait-fixture/first': '1', '@jait-fixture/second': '1' }, optionalDependencies: { '@jait-fixture/absent-optional': '1' }, peerDependencies: { '@jait-fixture/absent-peer': '1' }, peerDependenciesMeta: { '@jait-fixture/absent-peer': { optional: true } } };
        if (call.variant === 'missing-required') gateway.dependencies = { '@jait-fixture/absent-required': '1' } as any;
        writePackage(root, gateway);
        fs.mkdirSync(path.join(root, 'assets')); fs.writeFileSync(path.join(root, 'assets/readme'), 'included asset');
        fs.writeFileSync(path.join(root, 'source-secret.ts'), 'not a packaged file');
        if (call.variant !== 'missing-build') { fs.mkdirSync(path.join(root, 'dist')); fs.writeFileSync(path.join(root, 'dist/index.js'), 'gateway dist'); }
        const first = path.join(modules, '@jait-fixture/first'), second = path.join(modules, '@jait-fixture/second');
        const shared = path.join(modules, '@jait-fixture/shared');
        writePackage(first, { name: '@jait-fixture/first', version: '1', dependencies: { '@jait-fixture/shared': '1', '@jait-fixture/gateway': '1' } });
        writePackage(second, { name: '@jait-fixture/second', version: '1', dependencies: { '@jait-fixture/shared': '2' } });
        writePackage(shared, { name: '@jait-fixture/shared', version: '1' });
        writePackage(path.join(second, 'node_modules/@jait-fixture/shared'), { name: '@jait-fixture/shared', version: '2' });
        fs.mkdirSync(path.join(modules, '@jait-fixture'), { recursive: true });
        fs.symlinkSync(root, path.join(modules, '@jait-fixture/gateway'), 'dir');
        fs.mkdirSync(path.join(first, '.git')); fs.writeFileSync(path.join(first, '.git/private'), 'not packaged');
        const dest = path.join(project, 'apps/desktop/src-tauri/gateway');
        fs.mkdirSync(dest, { recursive: true }); fs.writeFileSync(path.join(dest, 'old'), 'removed');
        const result = spawnNode([subject], { env, cwd: base, encoding: 'utf8', timeout: 8000 });
        const read = (relative: string) => { const p = path.join(dest, relative); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
        const manifest = read('manifest.json');
        const pkgVersion = (relative: string) => { const content = read('node_modules/' + relative + '/package.json'); return content ? JSON.parse(content).version : null; };
        return { code: result.status, count: Number(result.stdout.match(/Packaged (\d+) production/)?.[1] ?? 0),
          manifest: manifest ? { gateway: JSON.parse(manifest).gateway, platform: JSON.parse(manifest).platform, arch: JSON.parse(manifest).arch, nodeVersion: /^\d+\.\d+\.\d+$/.test(JSON.parse(manifest).node) } : null,
          runtimeMode: fs.statSync(path.join(dest, 'runtime/node')).mode & 0o777,
          old: read('old'), dist: read('node_modules/@jait-fixture/gateway/dist/index.js'), asset: read('node_modules/@jait-fixture/gateway/assets/readme'),
          excluded: read('node_modules/@jait-fixture/gateway/source-secret.ts'), git: read('node_modules/@jait-fixture/first/.git/private'),
          shared: pkgVersion('@jait-fixture/shared'), nested: pkgVersion('@jait-fixture/second/node_modules/@jait-fixture/shared'),
          cyclicDuplicate: read('node_modules/@jait-fixture/first/node_modules/@jait-fixture/gateway/package.json'),
          missingRequired: result.stderr.includes('Missing dependency @jait-fixture/gateway -> @jait-fixture/absent-required'),
          missingBuild: result.stderr.includes('Build @jait-fixture/gateway before packaging') };
      }
      if (call.module === 'copyShellScript' || call.module === 'embedShellScript') {
        const dir = path.join(root, 'src/surfaces/shell-integration');
        const target = path.join(root, 'dist/surfaces/shell-integration');
        const bridge = path.join(root, 'src/surfaces/playwright-node-bridge.cjs');
        const out = path.join(root, 'src/surfaces/shell-integration-assets.ts');
        const assets: Record<string, string> = {"bash.sh": "echo \"$HOME\"\n", "zsh.sh": "quote \" \\ dollar $() 🦀\n\n", "pwsh.ps1": "Write-Host `literal`\r\n"};
        if (call.variant !== 'missing-source') {
          fs.mkdirSync(dir, { recursive: true });
          for (const [name, content] of Object.entries(assets)) fs.writeFileSync(path.join(dir, name), content);
          fs.mkdirSync(path.join(dir, 'nested')); fs.writeFileSync(path.join(dir, 'nested/item'), 'nested asset');
        }
        if (call.module === 'copyShellScript') {
          fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, 'old'), 'existing asset');
          fs.mkdirSync(path.dirname(bridge), { recursive: true });
          if (call.variant !== 'missing-bridge') fs.writeFileSync(bridge, 'fixture bridge');
          for (const asset of ['browser-cursor.cjs', 'browser-cursor.d.cts']) {
            fs.writeFileSync(path.join(root, 'src/surfaces', asset), 'fixture ' + asset);
          }
          const result = spawnNode([subject], { env, cwd: base, encoding: 'utf8', timeout: 8000 });
          const read = (p: string) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
          return { code: result.status, copied: Object.fromEntries(Object.keys(assets).map(name => [name, read(path.join(target, name))])), nested: read(path.join(target, 'nested/item')), old: read(path.join(target, 'old')), bridge: read(path.join(root, 'dist/surfaces/playwright-node-bridge.cjs')), cursor: read(path.join(root, 'dist/surfaces/browser-cursor.cjs')), cursorTypes: read(path.join(root, 'dist/surfaces/browser-cursor.d.cts')), stdout: normalize(result.stdout), missingSource: result.stderr.includes('shell integration source directory not found:'), missingBridge: result.stderr.includes('playwright-node-bridge.cjs') };
        }
        if (call.variant === 'check-stale') fs.writeFileSync(out, 'stale fixture');
        if (call.variant === 'check-current') cp.execFileSync(node, [subject], { env, cwd: base, timeout: 8000 });
        const result = spawnNode([subject, ...(call.variant?.startsWith('check-') ? ['--check'] : [])], { env, cwd: base, encoding: 'utf8', timeout: 8000 });
        let exports = null;
        if (result.status === 0 && fs.existsSync(out)) {
          const generated = await import(out);
          exports = { assets: generated.SHELL_INTEGRATION_ASSETS, bash: generated.BASH_INTEGRATION_SCRIPT, zsh: generated.ZSH_INTEGRATION_SCRIPT, pwsh: generated.PWSH_INTEGRATION_SCRIPT };
        }
        return { code: result.status, stdout: normalize(result.stdout), missing: result.stderr.includes(' is missing — run:'), stale: result.stderr.includes(' is out of date with '), exports };
      }
      if(call.module==='compileCacheScript') {
        if(call.variant==='explicit')env.NODE_COMPILE_CACHE=path.join(base,'explicit');
        if(['state','empty','explicit'].includes(call.variant))env.JAIT_STATE_DIR=' '+path.join(base,'state')+' ';
        if(call.variant==='empty')env.NODE_COMPILE_CACHE='';
        const program="import {pathToFileURL} from 'node:url';import * as mod from 'node:module';await import(pathToFileURL(process.argv[1]).href);const cache=process.env.NODE_COMPILE_CACHE;const actual=mod.getCompileCacheDir?.();process.stdout.write(JSON.stringify({cache,cacheActive:typeof actual==='string'&&(actual===cache||actual.startsWith(cache+'/'))}));";
        const result=spawnNode(['--input-type=module','-e',program,subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        if(result.status!==0)throw new Error('isolated compile cache failed: '+result.stderr);
        const resultData=JSON.parse(result.stdout);resultData.cache=normalize(resultData.cache);return resultData;
      }
      if(call.module==='bundleWebScript'){
        const src=path.join(base,'project/apps/web/dist'),dest=path.join(root,'web-dist');
        fs.mkdirSync(src,{recursive:true});fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'old'),'old');
        if(call.variant==='present'){fs.writeFileSync(path.join(src,'index.html'),'fixture index');fs.mkdirSync(path.join(src,'assets'));fs.writeFileSync(path.join(src,'assets/nested'),'fixture asset');}
        const result=spawnNode([subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        const read=(p:string)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;
        return {code:result.status,stdout:result.stdout,stderr:result.stderr,index:read(path.join(dest,'index.html')),nested:read(path.join(dest,'assets/nested')),oldPreserved:fs.existsSync(path.join(dest,'old')),sourcePreserved:fs.existsSync(src)};
      }
      if(call.module==='bundleMessengerScript'){
        const log=path.join(base,'builder.json');const fake=path.join(bin,'bun');
        const program="#!"+node+"\nimport {writeFileSync} from 'node:fs';writeFileSync(process.env.JAIT_BUILD_FIXTURE_LOG,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));console.log('fixture builder');if(process.env.JAIT_BUILD_FIXTURE_MODE==='exit')process.exit(7);if(process.env.JAIT_BUILD_FIXTURE_MODE==='signal')process.kill(process.pid,'SIGTERM');\n";
        fs.writeFileSync(fake,program,{mode:0o700});env.JAIT_BUILD_FIXTURE_LOG=log;env.JAIT_BUILD_FIXTURE_MODE=call.variant;
        if(call.variant!=='default')env.JAIT_BUILD_BUN=call.variant==='missing'?path.join(base,'absent-builder'):fake;
        const result=spawnNode([subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        return {code:result.status,stdout:result.stdout,enoent:result.stderr.includes('ENOENT'),calls:fs.existsSync(log)?[JSON.parse(normalize(fs.readFileSync(log,'utf8')))]:[]};
      }
      if(call.module==='installRuntimeScript'){
        if(call.variant==='development')fs.mkdirSync(path.join(root,'src'));
        if(!['development','packaged'].includes(call.variant)){
          const runtime=path.join(root,'dist/services/code-graph/graphify-runtime.js');fs.mkdirSync(path.dirname(runtime),{recursive:true});
          fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
          fs.writeFileSync(runtime,"export async function ensureGraphifyRuntime(options){"+(call.variant==='error'?"throw new Error('fixture runtime failure');":call.variant==='primitive'?"throw 'primitive failure';":"options.onProgress('fixture progress');")+"}");
        }
        const result=spawnNode([subject],{env,cwd:base,encoding:'utf8',timeout:8000});
        return {code:result.status,stdout:result.stdout,stderr:result.stderr};
      }
      throw new Error('unknown packaging fixture');
    }finally{fs.rmSync(base,{recursive:true,force:true});}
  }
  if(call.op==='sourcereview.osResolver'){
    const {mock}=await import('bun:test');const constructors:unknown[]=[];let listCalls=0;
    const manager={async listRunningOsSandboxes(){listCalls++;if(call.fail)throw new Error('inventory failed');return call.infos;}};
    (globalThis as any).__jaitOsReview={constructors,manager};
    mock.module(new URL('packages/gateway/src/os-control/linux-desktop-driver.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      LinuxDesktopOsControlDriver:class {osType='linux-desktop';constructor(manager:unknown,name:string){const f=(globalThis as any).__jaitOsReview;f.constructors.push({type:'linux-desktop',args:[manager===f.manager?'manager':'wrong manager',name]});}}
    }));
    mock.module(new URL('packages/gateway/src/os-control/windows-driver.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      WindowsOsControlDriver:class {osType='windows';constructor(...args:unknown[]){(globalThis as any).__jaitOsReview.constructors.push({type:'windows',args});}}
    }));
    try{
      const subject=await import(specifier);const resolver=subject.createOsControlResolver(manager,call.ssh??{});
      if(call.action==='list')return {result:await resolver.listSandboxes(),listCalls,constructors};
      const binding=await resolver.resolve(call.name);return {result:{containerName:binding.containerName,type:binding.type,driverType:binding.driver.osType},listCalls,constructors};
    }catch(e){return {error:(e as Error).message,listCalls,constructors};}
    finally{delete (globalThis as any).__jaitOsReview;mock.restore();}
  }
  if(call.op==='sourcereview.surfaceTools'){
    const {mock}=await import('bun:test');const calls:unknown[]=[];
    (globalThis as any).__jaitSurfaceReview={call,calls};
    mock.module(new URL('packages/gateway/src/tools/browser-tools.ts',new URL('../../../', import.meta.url)).pathname,()=>({
      createBrowserInspectTool(){return {async execute(input:unknown,context:any){const f=(globalThis as any).__jaitSurfaceReview;f.calls.push(['inspect',input,context.sessionId,context.projectRoot]);return f.call.inspectResult??{ok:true,message:'inspected',data:{browserId:'browser',extra:7}};}};}
    }));
    mock.module(new URL('packages/gateway/src/db/uuidv7.ts',new URL('../../../', import.meta.url)).pathname,()=>({uuidv7(){return 'fixed';}}));
    const registry={
      registeredTypes:['terminal','filesystem','browser'],
      listSnapshots(){calls.push(['list']);return call.snapshots;},
      async startSurface(type:string,id:string,options:unknown){calls.push(['start',type,id,options]);if(call.error){if(call.primitive)throw 'start failed';throw new Error('start failed');}return {snapshot(){return {id,type,...(options as object)};}};},
      async stopSurface(id:string,reason:unknown){calls.push(['stop',id,reason]);return call.stopped;},
      getSurface(id:unknown){calls.push(['get',id]);return call.browser?{id:'browser',snapshot(){return {id:'browser',type:'browser',state:'running'};}}:undefined;}
    };
    try{
      const subject=await import(specifier);const factory='createSurfaces'+call.action[0].toUpperCase()+call.action.slice(1)+'Tool';
      const tool=subject[factory](registry,call.preview?{}:undefined);
      return {result:await tool.execute(call.input??{},{sessionId:'current',projectRoot:'/fixture'}),calls};
    }finally{delete (globalThis as any).__jaitSurfaceReview;mock.restore();}
  }
  if (call.op === 'sourcereview.skillRoutes') {
    const { mock } = await import('bun:test');
    const events: unknown[] = [];
    const skill = { id: 'fixture', name: 'Fixture', description: 'fixture description', filePath: '/fixture/SKILL.md', source: 'project', enabled: true,
      ...(call.optional ? { requires: { bins: ['fixture-bin'] }, install: [{ id: 'node', kind: 'node', package: 'fixture' }] } : {}) };
    mock.module(new URL('packages/gateway/src/skills/index.ts', new URL('../../../', import.meta.url)).pathname, () => ({
      checkSkillTools(value: unknown) { events.push(['check', value === skill]); return { satisfied: !call.optional, missing: call.optional ? ['fixture-bin'] : [] }; },
    }));
    mock.module(new URL('packages/gateway/src/skills/install.ts', new URL('../../../', import.meta.url)).pathname, () => ({
      async installSkillTool(input: any) { events.push(['install', input.skill === skill, input.installId ?? null]);
        if (call.error) { if (call.primitive) throw call.error; throw new Error(call.error); }
        return { ok: true, message: 'fixture installed' };
      },
    }));
    const { default: Fastify } = await import('../../../packages/gateway/node_modules/fastify/fastify.js');
    const app = Fastify({ logger: false });
    try {
      const subject = await import(specifier);
      subject.registerSkillRoutes(app, {
        list() { events.push(['list']); return [skill]; },
        get(id: string) { events.push(['get', id]); return id === 'fixture' ? skill : undefined; },
        setEnabled(id: string, enabled: boolean) { events.push(['set', id, enabled]); skill.enabled = enabled; },
      });
      const responses = [];
      for (const req of call.requests) { const response = await app.inject(req); responses.push({ status: response.statusCode, body: response.json() }); }
      return { responses, events };
    } finally { await app.close(); mock.restore(); }
  }
  if (call.op === 'sourcereview.skillDiscovery') {
    const subject = await import(specifier);
    if (call.mode === 'search') return subject.searchInstalledSkills(call.skills, call.query, call.limit);
    const fs = await import('node:fs');
    const base = fs.mkdtempSync(join(new URL('../../../', import.meta.url).pathname, '.jait/artifacts/source-review/skill-'));
    const path = join(base, 'SKILL.md'); fs.writeFileSync(path, 'Fixture instructions\nwith literal $() and `text`.');
    const skill = { id: 'fixture', name: 'Fixture', description: 'fixture skill', filePath: path, source: 'project', enabled: true };
    const events: unknown[] = [];
    try {
      const tools = subject.createSkillDiscoveryTools({
        listEnabled() { events.push(['list']); return [skill]; },
        get(id: string) { events.push(['get', id]); return id === 'fixture' ? skill : id === 'disabled' ? { ...skill, enabled: false } : id === 'missing-file' ? { ...skill, filePath: join(base, 'absent') } : undefined; },
      });
      const results = [];
      for (const request of call.requests) {
        const value = await tools[request.tool === 'search' ? 0 : 1].execute(request.input);
        if (value.data?.baseDirectory) value.data.baseDirectory = value.data.baseDirectory.replace(base, 'FIXTURE');
        results.push(value);
      }
      return { metadata: tools.map((t: any) => ({ name: t.name, category: t.category, tier: t.tier, risk: t.risk, consent: t.defaultConsentLevel, required: t.parameters.required })), results, events };
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  }
  if (call.op === 'sourcereview.remoteImages') {
    const { EventEmitter } = await import('node:events');
    const events: unknown[] = [];
    const oldTimeout = globalThis.setTimeout, oldClear = globalThis.clearTimeout;
    let timerCallback: (() => void) | undefined;
    globalThis.setTimeout = ((fn: () => void, ms: number) => { timerCallback = fn; events.push(['timer', ms]); return 42; }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: unknown) => { events.push(['clear', id]); }) as typeof clearTimeout;
    const transport = {
      async publicMailServer(input: unknown) { events.push(['pin', input]); if (call.pinError) throw new Error('fixture pin rejected'); return { host: '203.0.113.20', servername: 'images.example' }; },
      request(options: unknown, callback: (res: any) => void) {
      events.push(['request', options]);
      const req: any = new EventEmitter();
      req.destroy = (error: Error) => { events.push(['requestDestroy', error.message]); req.emit('error', error); req.emit('close'); };
      req.end = () => { events.push(['end']); queueMicrotask(() => {
        if (call.timeout) { timerCallback?.(); return; }
        if (call.requestError) { req.destroy(new Error('fixture request failed')); return; }
        const res: any = new EventEmitter(); let destroyed = false;
        res.statusCode = call.status ?? 200; res.headers = call.noType ? {} : { 'content-type': call.type ?? 'image/png' };
        res.destroy = (error?: Error) => { destroyed = true; events.push(['responseDestroy', error?.message ?? null]); if (error) res.emit('error', error); req.emit('close'); };
        callback(res);
        if (destroyed) return;
        if (call.responseError) { res.emit('error', new Error('fixture response failed')); req.emit('close'); return; }
        for (const chunk of call.chunks ?? ['abc']) { if (destroyed) break; res.emit('data', typeof chunk === 'number' ? Buffer.alloc(chunk, 97) : Buffer.from(chunk)); }
        if (!destroyed) { res.emit('end'); req.emit('close'); }
      }); };
      return req;
    } };
    try {
      const subject = await import(specifier);
      let result;
      try { const value = await subject.loadMailImage(call.raw ?? 'https://images.example/a.png?q=1#fragment', transport); result = call.summary ? { length: value.length, prefix: value.slice(0, 22), suffix: value.slice(-8) } : value; }
      catch (error) { result = { error: (error as Error).message }; }
      return { result, events };
    } finally { globalThis.setTimeout = oldTimeout; globalThis.clearTimeout = oldClear; }
  }
  if (call.op === 'sourcereview.graphifyRunner') {
    const fs = await import('node:fs');
    const base = fs.mkdtempSync(join(new URL('../../../', import.meta.url).pathname, '.jait/artifacts/source-review/graphify-'));
    const subject = await import(specifier);
    const events: unknown[] = [];
    const signal = new AbortController().signal;
    const outputDir = join(base, 'output'), projectRoot = join(base, 'project with $literal');
    fs.mkdirSync(projectRoot);
    const normalize = (value: unknown): any => typeof value === 'string' ? value.replaceAll(base, 'ROOT') : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)])) : value;
    try {
      const runner = new subject.GraphifyRunner({
        command: 'fixture-graphify',
        async ensureRuntime() { events.push(['ensure', fs.existsSync(outputDir)]); if (call.ensureError) throw new Error('fixture setup failed'); },
        async execute(command: string, args: string[], options: any) {
          events.push({ command, args, cwd: options.cwd, queryLog: options.env.GRAPHIFY_QUERY_LOG_DISABLE ?? null, sameSignal: options.signal === signal, outputExists: fs.existsSync(outputDir) });
          if (args[0] === '--version') {
            if (call.versionError === 'unavailable') throw new subject.GraphifyUnavailableError();
            if (call.versionError) throw new Error('fixture version failed');
            return { stdout: call.versionStdout ?? '  fixture 1.2 \n', stderr: call.versionStderr ?? '' };
          }
          if (call.buildError) throw new Error('fixture extract failed');
          if (call.layout === 'nested' || call.layout === 'both') { fs.mkdirSync(join(outputDir, 'graphify-out')); fs.writeFileSync(join(outputDir, 'graphify-out/graph.json'), '{}'); }
          if (call.layout === 'legacy' || call.layout === 'both') fs.writeFileSync(join(outputDir, 'graph.json'), '{}');
          return { stdout: 'fixture graph output', stderr: 'fixture warning' };
        },
      });
      let result;
      try { result = call.mode === 'version' ? await runner.getVersion(projectRoot) : await runner.build({ projectRoot, outputDir, signal }); }
      catch (e) { result = { error: (e as Error).message, name: (e as Error).name }; }
      return normalize({ result, events });
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  }
  if (call.op === 'sourcereview.sandboxBackground') {
    const { mock } = await import('bun:test');
    const events: unknown[] = [];
    const controller = new AbortController();
    let tracked: any, output: ((chunk: string) => void) | undefined;
    let complete!: (result: any) => void;
    const completion = new Promise<any>(resolve => { complete = resolve; });
    mock.module(new URL('packages/gateway/src/services/background-command-monitor.ts', new URL('../../../', import.meta.url)).pathname, () => ({
      backgroundCommandMonitor: { trackExternal(input: any) { tracked = input; events.push(['track', input.sessionId, input.terminalId, input.command, input.startedAt, input.shouldNotify()]); return !call.limit; } },
    }));
    mock.module(new URL('packages/gateway/src/db/uuidv7.ts', new URL('../../../', import.meta.url)).pathname, () => ({ uuidv7() { return 'fixture-id'; } }));
    const subject = await import(specifier);
    const timers = new Map<number, { fn: () => void; ms: number }>();
    const set = globalThis.setTimeout, clear = globalThis.clearTimeout, now = Date.now;
    let timerId = 0;
    globalThis.setTimeout = ((fn: () => void, ms: number) => { const id = ++timerId; timers.set(id, { fn, ms }); events.push(['timer', id, ms]); return id; }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: number) => { timers.delete(id); events.push(['clear', id]); }) as unknown as typeof clearTimeout;
    Date.now = () => 1000;
    const options = { timeoutMs: call.timeout ?? 12000, fixture: true };
    const result = call.result ?? { ok: true, output: 'finished', exitCode: 0, timedOut: false };
    if (call.mode === 'preabort') controller.abort();
    try {
      const pending = subject.runSandboxBackgroundTerminal({
        startBackgroundCommand(received: unknown) {
          events.push(['start', received === options]);
          if (call.mode === 'installabort') controller.abort();
          return { containerName: 'fixture-container', output: 'startup output', completion,
            async stop() { events.push(['stop']); },
            onOutput(fn: (chunk: string) => void) { output = fn; events.push(['listen']); return () => { events.push(['unlisten']); }; },
          };
        },
      }, options, 'fixture command', { sessionId: 'session', sandboxContainerName: call.thread ? 'thread-container' : undefined, signal: controller.signal, onOutputChunk(chunk: string) { events.push(['output', chunk]); } });
      if (call.mode === 'complete') complete(result);
      else if (call.mode === 'abort') controller.abort();
      else if (!['preabort', 'installabort'].includes(call.mode)) {
        if (call.mode === 'idle') { output?.('one'); output?.('two'); }
        const timer = [...timers.entries()].find(([, t]) => t.ms === (call.mode === 'idle' ? 500 : Math.min(options.timeoutMs, 5000)));
        if (timer) { timers.delete(timer[0]); timer[1].fn(); }
      }
      const returned = await pending;
      output?.('late ignored');
      let after = null;
      if (tracked && !call.limit) {
        const initial = tracked.shouldNotify();
        if (call.cancelWatched) tracked.onCancel();
        if (call.abortWatched) controller.abort();
        const notified = tracked.shouldNotify();
        complete(result);
        const final = await tracked.exitPromise;
        after = { initial, notified, result: final };
      }
      return { result: returned, events, after, remainingTimers: timers.size };
    } finally { globalThis.setTimeout = set; globalThis.clearTimeout = clear; Date.now = now; mock.restore(); }
  }
  if (['sourcereview.assessmentRoutes', 'sourcereview.workbenchRoutes', 'sourcereview.environmentRoutes'].includes(call.op)) {
    const { mock } = await import('bun:test');
    const { Database } = await import('bun:sqlite');
    const database = new Database(':memory:');
    const events: unknown[] = [];
    const service: any = {};
    for (const name of ['history', 'createScope', 'start', 'getRun', 'cancel', 'compare', 'engines', 'get', 'report', 'deleteRun', 'plan', 'verify', 'decide']) {
      service[name] = (...args: unknown[]) => {
        events.push([name, ...args.map(value => value === undefined ? null : value)]);
        if (call.fail === name) { if (call.primitive) throw 'fixture failure'; throw new Error('fixture failure'); }
        return { fixture: name };
      };
    }
    if (call.module === 'assessmentRoutes') {
      mock.module(new URL('packages/gateway/src/security/assessment.ts', new URL('../../../', import.meta.url)).pathname, () => ({ getAssessmentService: () => service }));
    }
    const scheduler = { fixture: 'scheduler' };
    if (call.module === 'workbenchRoutes') {
      mock.module(new URL('packages/gateway/src/security/workbench.ts', new URL('../../../', import.meta.url)).pathname, () => ({ getSecurityWorkbench: () => service }));
      mock.module(new URL('packages/gateway/src/tools/security-workbench-tools.ts', new URL('../../../', import.meta.url)).pathname, () => ({
        createSecurityWorkbenchTools(received: unknown) { events.push(['tools', received === scheduler]); return [{ name: 'unrelated' }, { name: 'security.monitor.schedule', async execute(input: unknown, context: any) {
          events.push(['schedule', input, { ...context, projectRoot: context.projectRoot === process.cwd() ? 'PROJECT' : context.projectRoot }]);
          if (call.monitorThrow) throw new Error('fixture monitor failed');
          return { ok: call.monitorOk !== false, message: 'fixture monitor denied', data: { fixture: 'monitor' } };
        } }]; },
      }));
    }
    database.exec('CREATE TABLE projects (id TEXT, user_id TEXT, node_id TEXT); CREATE TABLE sessions (id TEXT, user_id TEXT, project_path TEXT, metadata TEXT, status TEXT, project_id TEXT); CREATE TABLE network_hosts (ip TEXT, mac TEXT, hostname TEXT, os_version TEXT, open_ports TEXT, ssh_reachable INTEGER, agent_status TEXT, providers TEXT, last_seen_at TEXT);');
    for (const row of call.projects ?? []) database.prepare('INSERT INTO projects VALUES (?, ?, ?)').run(row.id, row.owner, row.node ?? null);
    for (const row of call.sessions ?? []) database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)').run(row.id, row.owner, row.path ?? null, row.metadata ?? null, row.status ?? 'active', row.project ?? null);
    for (const row of call.hosts ?? []) database.prepare('INSERT INTO network_hosts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...row);
    const { default: Fastify } = await import('../../../packages/gateway/node_modules/fastify/fastify.js');
    const auth = await import(new URL('packages/gateway/src/security/http-auth.ts', new URL('../../../', import.meta.url)).href);
    const secret = 'fixture-security-route-secret';
    const token = await auth.signAuthToken({ id: 'owner', username: 'fixture' }, secret);
    const app = Fastify({ logger: false, genReqId: () => 'fixture-request' });
    try {
      const subject = await import(specifier);
      if (call.module === 'assessmentRoutes') subject.registerSecurityAssessmentRoutes(app, { jwtSecret: secret }, call.noDatabase ? undefined : database);
      else if (call.module === 'workbenchRoutes') subject.registerSecurityWorkbenchRoutes(app, { jwtSecret: secret }, call.scheduler ? scheduler : undefined);
      else {
        const deps = call.empty ? {} : {
          assistantProfileService: { list(user: unknown) { events.push(['assistants', user]); return [{ id: 'assistant', name: 'Fixture' }]; } },
          projectService: { list(status: unknown, user: unknown) { events.push(['projects', status, user]); return call.environmentProjects ?? []; }, getActiveSessionCounts(user: unknown) { events.push(['counts', user]); return new Map(call.counts ?? []); } },
          repoService: { list(user: unknown) { events.push(['repositories', user]); return call.repositories ?? []; } },
          providerRegistry: { async checkAll() { events.push(['providers']); if (call.providerError) throw new Error('fixture providers failed'); return call.providers ?? []; } },
          ws: { getNodeRegistry() { events.push(['nodes']); return { nodes: call.nodes ?? [] }; }, getFsNodes() { events.push(['fsNodes']); return call.fsNodes ?? []; } },
          sqlite: database,
        };
        subject.registerEnvironmentRoutes(app, { jwtSecret: secret }, deps);
      }
      const responses = [];
      for (const request of call.requests) {
        const response = await app.inject({ method: request.method, url: request.url, ...(request.payload === undefined ? {} : { payload: request.payload }), headers: request.unauth ? {} : { authorization: 'Bearer ' + (request.invalid ? 'invalid' : token) } });
        const body = response.json();
        if (body.snapshot) { const value = body.snapshot.serverTime; body.snapshot.serverTime = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? 'ISO_TIMESTAMP' : value; }
        responses.push({ status: response.statusCode, body });
      }
      return { responses, events };
    } finally { await app.close(); database.close(); mock.restore(); }
  }
  const m = await import(specifier);
  switch (call.op) {
    case 'sourcereview.homeassistant': {
      const previousFetch = globalThis.fetch;
      const keys = ['HA_URL', 'HA_TOKEN', 'HASS_URL', 'HASS_TOKEN'];
      const previousEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]));
      const requests: unknown[] = [];
      const controller = new AbortController();
      if (call.aborted) controller.abort();
      try {
        for (const key of keys) {
          delete process.env[key];
          if (call.env?.[key] !== undefined) process.env[key] = call.env[key];
        }
        globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
          requests.push({ url: String(url), method: init?.method, headers: init?.headers,
            body: init?.body ?? null, sameSignal: init?.signal === controller.signal,
            aborted: init?.signal?.aborted });
          if (call.failure) throw call.failure === 'primitive' ? 'fixture network failure' : new Error('fixture network failure');
          return new Response(call.text === undefined ? JSON.stringify(call.response ?? []) : call.text,
            { status: call.status ?? 200 });
        }) as typeof fetch;
        const tools: Record<string, any> = { states: m.createHomeAssistantStatesTool(),
          call: m.createHomeAssistantCallServiceTool(), services: m.createHomeAssistantServicesTool() };
        if (call.action === 'metadata') return Object.values(tools).map((tool: any) => ({
          name: tool.name, tier: tool.tier, category: tool.category, source: tool.source,
          risk: tool.risk, required: tool.parameters.required ?? [], properties: Object.keys(tool.parameters.properties),
        }));
        const result = await tools[call.action].execute(call.input ?? {}, {
          userId: 'fixture-owner', sessionId: 'fixture-session', actionId: 'fixture-action',
          projectRoot: '/fixture', apiKeys: call.apiKeys ?? { HA_URL: 'http://fixture.invalid:8123/', HA_TOKEN: 'fixture-token' },
          signal: controller.signal,
        });
        return { result, requests };
      } finally {
        globalThis.fetch = previousFetch;
        for (const key of keys) {
          const previous = previousEnvironment[key];
          if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
        }
      }
    }

    case 'sourcereview.updateFailure': {
      let input = call.kind === 'error' ? Object.assign(new Error(call.input ?? ''), call.code === undefined ? {} : { code: call.code }) : call.input;
      if (call.length) input = 'x'.repeat(call.length) + (call.suffix ?? '');
      const result = m.describeUpdateFailure(input);
      return call.summary ? { code: result.code, detailLength: result.detail.length, prefix: result.detail.slice(0, 4), suffix: result.detail.slice(-8), hint: result.hint } : result;
    }
    case 'sourcereview.barrel': {
      const { default: ts } = await import('typescript');
      const projectRoot = new URL('../../../', import.meta.url);
      const text = readFileSync(new URL(specifier, import.meta.url), 'utf8');
      const syntax = ts.createSourceFile(specifier, text, ts.ScriptTarget.Latest, true);
      const otherStatements = syntax.statements.filter(node => !ts.isExportDeclaration(node)).length;
      const bindings = [];
      for (const binding of call.bindings) {
        const original = await import(new URL(binding.path, projectRoot).href);
        bindings.push(m[binding.name] === (binding.original === '*' ? original : original[binding.original ?? binding.name]));
      }
      return { exports: Object.keys(m).sort(), bindings, otherStatements };
    }
    case 'sourcereview.voice': {
      const spoken: unknown[] = [];
      const tool = m.createVoiceSpeakTool({ speak(input: unknown) { spoken.push(input); if (call.fail) throw new Error('TTS fixture unavailable'); return { mimeType: 'audio/wav', audioBase64: 'YWJjZA==' }; } });
      if (call.metadata) { const { execute: _execute, ...metadata } = tool; return metadata; }
      try { return { result: await tool.execute(call.input, call.context ?? { sessionId: 'session-a' }), spoken }; }
      catch (error) { return { error: (error as Error).message, spoken }; }
    }
    case 'sourcereview.editor': {
      const sent: unknown[] = [];
      const ws = call.noChannel ? undefined : { sendUICommand(...args: unknown[]) { sent.push(args); if (call.fail) throw new Error('UI fixture unavailable'); } };
      const tool = m.createProjectEditorOpenTool(ws);
      if (call.metadata) { const { execute: _execute, ...metadata } = tool; return metadata; }
      try { return { result: await tool.execute({}, call.context), sent }; }
      catch (error) { return { error: (error as Error).message, sent }; }
    }
    case 'sourcereview.lists': {
      if (call.kind === 'ellipsize') return m.ellipsizeText(call.text, call.max);
      if (call.kind === 'list') return m.formatEllipsedList(call.lines, call.max);
      if (call.kind === 'summary') return m.summarizeWithPreview(call.summary, call.lines, call.max);
      if (call.kind === 'memory') return m.memoryLine(call.id, call.text, call.type, call.extra);
      return { characters: m.PREVIEW_MAX_CHARS, items: m.PREVIEW_MAX_ITEMS };
    }
    case 'sourcereview.swarm': {
      const now = Date.now; Date.now = () => 1234;
      try { return call.steps.map((step: any) => {
        switch (step.op) {
          case 'create': m.createSwarmRound(step.id, step.count); return null;
          case 'end': m.endSwarmRound(step.id); return null;
          case 'post': return structuredClone(m.postSwarmMessage(step.id, step.from, step.text));
          case 'count': return m.getSwarmParticipantCount(step.id);
          default: return structuredClone(m.peekSwarmMessages(step.id));
        }
      }); } finally { Date.now = now; }
    }
    case 'sourcereview.control': {
      const created: unknown[] = [];
      const sessions = call.noSessions ? undefined : {
        getById(id: string, user: string) { return call.sessions?.some((s: any) => s.id === id && s.userId === user) ? { id } : undefined; },
        create: call.noCreate ? undefined : (input: unknown) => { created.push(input); return { id: 'created-session' }; },
      };
      const surfaces = call.noSurfaces ? undefined : {
        getSurface(id: string) { return call.surfaces?.find((s: any) => s.id === id); },
        getOwner(id: string) { return call.surfaces?.find((s: any) => s.id === id)?.owner; },
      };
      const consent = call.noConsent ? undefined : { getRequest(id: string) { return call.requests?.find((r: any) => r.id === id); } };
      const threads = call.noThreads ? undefined : { getById(id: string) { return call.threads?.find((t: any) => t.id === id); } };
      const policy = new m.ControlAccess(sessions, surfaces, consent, threads);
      return { values: call.steps.map((step: any) => policy[step.kind](...step.args)), created };
    }
    case 'sourcereview.routes': {
      const { default: Fastify } = await import('../../../packages/gateway/node_modules/fastify/fastify.js');
      const app = Fastify({ logger: false });
      const events: unknown[] = [];
      if (call.module === 'trust') m.registerTrustRoutes(app, {
        listAll() { events.push(['list']); return [{ actionType: 'terminal', level: 2 }]; },
        getState(action: string) { events.push(['get', action]); if (call.fail) throw new Error('Trust fixture unavailable'); return { actionType: action, level: 1 }; },
        reset(action: string) { events.push(['reset', action]); return { actionType: action, level: 0 }; },
      });
      else m.registerHookRoutes(app, { hookSecret: 'fixture-secret', hooks: { emit(...args: unknown[]) { events.push(args); } },
        async onWake() { events.push(['onWake']); if (call.fail) throw new Error('Hook fixture unavailable'); return { awakened: true }; },
        async onAgentHook(payload: unknown) { events.push(['onAgentHook', payload]); if (call.fail) throw new Error('Hook fixture unavailable'); return { accepted: true }; },
      });
      try {
        const responses = [];
        for (const request of call.requests) { const response = await app.inject(request); responses.push({ status: response.statusCode, body: response.json() }); }
        return { responses, events };
      } finally { await app.close(); }
    }
    case 'sourcereview.surface': {
      let snapshots = 0;
      const surface = { type: call.type, snapshot() { snapshots++; return { metadata: call.metadata }; } };
      return { result: m.shouldSyncProjectSurfaceUi(surface), snapshots };
    }
    case 'sourcereview.ownership': {
      const sent: unknown[] = [];
      const reply = { status(code: number) { sent.push(code); return this; }, send(value: unknown) { sent.push(value); return this; } };
      return { result: m.assertOwnership(reply, call.resource, call.user, 'Resource unavailable'), sent };
    }
    case 'sourcereview.lease': {
      const releases: Record<string, () => void> = {};
      return call.steps.map((step: any) => {
        try { if (step.release) { releases[step.release]!(); return 'released'; }
          releases[step.key] = m.claimAssessmentExecution(step.id); return 'claimed'; }
        catch (error) { return { error: (error as Error).message }; }
      });
    }
    case 'sourcereview.state': {
      const previous = process.env.JAIT_STATE_DIR;
      try {
        if (call.value === null) delete process.env.JAIT_STATE_DIR; else process.env.JAIT_STATE_DIR = call.value;
        const value = m.getStateDirectory();
        return { value: value === join(homedir(), '.jait') ? '$DEFAULT' : value };
      } catch (error) { return { error: (error as Error).message }; }
      finally { if (previous === undefined) delete process.env.JAIT_STATE_DIR; else process.env.JAIT_STATE_DIR = previous; }
    }
    case 'sourcereview.inline': {
      if (call.html !== undefined) return m.embedInlineImages(call.html, new Map(call.images));
      const data = call.repeat ? call.repeat.character.repeat(call.repeat.count) : call.data;
      const value = m.inlineImageData(call.type, data);
      return call.summary && value !== null ? { prefix: value.slice(0, value.indexOf(',') + 1), length: value.length, bytes: Buffer.from(value.split(',')[1], 'base64').length } : value;
    }
    case 'sourcereview.preview': {
      if (call.token) return m.verifyPreviewToken(call.token, call.resource, call.secret);
      if (call.roundtrip) {
        const token = await m.signPreviewToken(call.user, call.resource, call.secret);
        const payload = jose.decodeJwt(token);
        return { user: await m.verifyPreviewToken(token, call.verifyResource ?? call.resource, call.verifySecret ?? call.secret),
          payload: { sub: payload.sub, purpose: payload.purpose, resource: payload.resource, ttl: Number(payload.exp) - Number(payload.iat) },
          algorithm: jose.decodeProtectedHeader(token).alg };
      }
      const token = await new jose.SignJWT(call.claims).setProtectedHeader({ alg: call.alg ?? 'HS256' }).sign(new TextEncoder().encode(call.secret));
      return m.verifyPreviewToken(token, call.resource, call.verifySecret ?? call.secret);
    }
    case 'sourcereview.origin': return m.isAllowedRequestOrigin(call.headers, { corsOrigin: call.cors ?? '' });
    case 'sourcereview.git': return m.resolveRemoteGitNodeId(call.nodes, call.cwd, call.requested, call.local);
    case 'sourcereview.shell': return call.line === undefined ? m.isPowerShellShell(call.shell) : m.isShellPromptLine(call.line, call.shell);
    case 'sourcereview.cron': return m.isValidCronExpression(call.repeat ? 'x'.repeat(call.repeat) : call.cron);
    case 'sourcereview.headers': {
      const input = { openaiApiKey: 'fixture-key', ...call.input };
      const first = m.llmRequestHeaders(input, call.session);
      if (!call.observeGenerated) return first;
      const second = m.llmRequestHeaders(input);
      const other = m.llmRequestHeaders({ ...input });
      return { keys: Object.keys(first).sort(), stable: first['x-opencode-session'] === second['x-opencode-session'],
        distinct: first['x-opencode-session'] !== other['x-opencode-session'],
        uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first['x-opencode-session']) };
    }
    case 'sourcereview.devices': {
      const registry = new m.DeviceRegistry();
      const OriginalDate = Date;
      let tick = 0;
      const start = OriginalDate.parse('2026-01-01T00:00:00.000Z');
      globalThis.Date = class extends OriginalDate { constructor() { super(start + tick++ * 1000); } } as typeof Date;
      try {
        return call.steps.map((step: any) => step.op === 'register' ? registry.register(step.input) : step.op === 'heartbeat' ? registry.heartbeat(step.id) : step.op === 'count' ? registry.count() : registry.list());
      } finally { globalThis.Date = OriginalDate; }
    }

    case 'sourcereview.output': {
      const number = (x: unknown) => x === 'nan' ? NaN : x === 'infinity' ? Infinity : x;
      return m.getTerminalOutputSlice(call.buffer, call.count, number(call.offset), number(call.end), call.lines, call.trim);
    }
    case 'sourcereview.diagram': return m.createDiagramTool().execute(call.diagramRepeat ? {diagram:'x'.repeat(call.diagramRepeat)} : call.input);
    case 'sourcereview.link': return m.jaitLinkTool.execute(call.input);
    case 'sourcereview.mobile': {
      const calls: unknown[] = []; const now = Date.now; Date.now = () => 1767225600000;
      try { const result = await m.createMobileAlarmScheduleTool({scheduleAlarm(...args: unknown[]) { calls.push(args); return call.delivered ?? 0; }}).execute(call.input, call.context); return {result,calls}; }
      finally { Date.now = now; }
    }
    case 'sourcereview.mount': {
      const fs = await import('node:fs'); const path = await import('node:path');
      const base = fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname, '.jait/artifacts/source-review', 'worktree-'));
      try {
        const common=path.join(base, call.variant==='colon' ? 'bad:name' : 'repo', '.git');
        const admin=path.join(common, call.variant==='admin' ? 'unregistered' : 'worktrees', 'w'); const project=path.join(base,'project');
        fs.mkdirSync(admin,{recursive:true});fs.mkdirSync(project);
        if(call.variant==='missing') return m.worktreeGitMountArgs(project);
        if(call.variant==='directory'){fs.mkdirSync(path.join(project,'.git'));return m.worktreeGitMountArgs(project);}
        fs.writeFileSync(path.join(admin,'commondir'),'../..'); fs.writeFileSync(path.join(admin,'gitdir'),path.join(project,call.variant==='backlink' ? 'other' : '.git'));
        fs.writeFileSync(path.join(project,'other'),'dummy');
        if(call.variant==='symlink')fs.symlinkSync(path.join(project,'other'),path.join(project,'.git'));
        else fs.writeFileSync(path.join(project,'.git'),call.variant==='invalid' ? 'wrong marker' : 'gitdir: '+path.relative(project,admin)+'\n');
        try {return m.worktreeGitMountArgs(project).join(',').replaceAll(common,'COMMON');} catch(e){return (e as Error).message;}
      } finally {fs.rmSync(base,{recursive:true,force:true});}
    }
    case 'sourcereview.ownerRuntime': {
      const own=m.commandSandboxOwner();const [pid,start,boot]=own.split(':'); const previous=process.env.JAIT_STATE_DIR;
      try {
        process.env.JAIT_STATE_DIR='/fixture/state'; const a=m.commandSandboxGateway();process.env.JAIT_STATE_DIR=' /fixture/state ';const b=m.commandSandboxGateway();process.env.JAIT_STATE_DIR='/fixture/other';const c=m.commandSandboxGateway();
        return {ownAlive:m.commandSandboxOwnerAlive(own),wrongStart:m.commandSandboxOwnerAlive(`${pid}:${Number(start)+1}:${boot}`),wrongBoot:m.commandSandboxOwnerAlive(`${pid}:${start}:wrong-boot`),dead:m.commandSandboxOwnerAlive(`2147483647::${boot}`),malformed:['bad','-1::','0::','9007199254740992::','1:too:many:fields'].map(x=>m.commandSandboxOwnerAlive(x)),format:/^\d+:\d+:[0-9a-f-]+$/.test(own),digestLength:a.length,sameState:a===b,differentState:a!==c};
      }finally{if(previous===undefined)delete process.env.JAIT_STATE_DIR;else process.env.JAIT_STATE_DIR=previous;}
    }
    case 'sourcereview.usageCache': {
      let now=0,loads=0;const cache=new m.UsageRefreshCache(()=>now);
      if(call.mode==='force') {
        let finish!: (v:string)=>void;const first=cache.run('a',()=>{loads++;return new Promise<string>(r=>{finish=r;});});
        const joined=cache.run('a',async()=>{loads++;return 'wrong';},{force:true});await Promise.resolve();finish('first');const one=await first;
        now=299999;const fresh=cache.run('a',async()=>{loads++;return 'wrong';});const two=await fresh;
        const three=await cache.run('a',async()=>{loads++;return 'second';},{force:true});now+=300000;
        const four=await cache.run('a',async()=>{loads++;return 'third';});return {sameInFlight:first===joined,sameFresh:first===fresh,values:[one,two,three,four],loads};
      }
      if(call.mode==='backoff') {
        const load=async()=>{loads++;return loads<5?'bad':'ok';};const options={failed:(v:string)=>v==='bad'};
        const values=[];
        for(const instant of [0,599999,600000,1799999,1800000,3599999,3600000,5400000,5700000]){now=instant;values.push(await cache.run('a',load,options));}
        let throwLoads=0;const thrown=[];
        for(const key of ['sync','async']){try{await cache.run(key,()=>{throwLoads++;if(key==='sync')throw new Error(key);return Promise.reject(new Error(key));});}catch(e){thrown.push((e as Error).message);}}
        return {values,loads,thrown,throwLoads};
      }
      const promises=[];for(let i=0;i<1000;i++)promises.push(cache.run(String(i),async()=>{loads++;return 'old';}));
      const joined=promises[0]===cache.run('0',async()=>{loads++;return 'wrong';},{force:true});let blocked='';try{await cache.run('new',async()=>{loads++;return 'wrong';});}catch(e){blocked=(e as Error).message;}
      await Promise.all(promises);now=300000;const expired=await cache.run('new',async()=>{loads++;return 'new';});return {blocked,joined,expired,loads};
    }


    case 'sourcereview.mcpConfig': return m.mergeJaitCodexConfig(call.input);
    case 'sourcereview.mcpConstants': return [m.JAIT_CORE_MCP_SERVER_NAME,m.JAIT_DEFERRED_MCP_SERVER_NAME,m.JAIT_CORE_CODE_MODE_NAMESPACE,m.OMNIROUTE_MCP_SERVER_NAME];
    case 'sourcereview.messenger': {
      const signal=new AbortController().signal;const calls: unknown[]=[];
      const tools=m.createMessengerTools({request(user:unknown,command:unknown,received:unknown){calls.push({user,command,sameSignal:signal===received});return {ok:true,message:'fixture bridge result'};}});
      if(call.metadata)return tools.map((t:any)=>({name:t.name,risk:t.risk,consent:t.defaultConsentLevel,required:t.parameters.required}));
      const tool=tools.find((t:any)=>t.name==='messenger.'+call.action);
      return {result:await tool.execute(call.input,{userId:'fixture-user',signal}),calls};
    }

    case 'sourcereview.nodeState': {
      const OriginalDate=Date;let instant=0;
      globalThis.Date=class extends OriginalDate {constructor(){super(instant);}static now(){return instant;}} as DateConstructor;
      try {
        const manager=new m.NodeStateManager();const results=[];
        for(const [index,action] of call.actions.entries()) {
          instant=index*1000;
          switch(action.kind) {
            case 'upsert': results.push(manager.upsertNode(action.input));break;
            case 'get': results.push(manager.getNode(action.id));break;
            case 'client':results.push(manager.getClientId(action.id));break;
            case 'remove':results.push(manager.removeNode(action.id));break;
            case 'disconnect':results.push(manager.removeNodesByClientId(action.clientId));break;
            case 'list':results.push(manager.listNodes());break;
            case 'snapshot':results.push(manager.getSnapshot());break;
            default:throw new Error('unknown node fixture action');
          }
        }
        return results;
      }finally{globalThis.Date=OriginalDate;}
    }
    case 'sourcereview.transfer': {
      const fs=await import('node:fs');const path=await import('node:path');
      const base=fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts/source-review','transfer-'));
      const before={path:process.env.PATH,log:process.env.JAIT_TRANSFER_FIXTURE_LOG,fail:process.env.JAIT_TRANSFER_FIXTURE_FAIL};
      try {
        const log=path.join(base,'calls.jsonl');process.env.JAIT_TRANSFER_FIXTURE_LOG=log;process.env.JAIT_TRANSFER_FIXTURE_FAIL=call.fail??'';
        for(const program of ['ssh','scp']) fs.writeFileSync(path.join(base,program),`#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nconst name=${JSON.stringify(program)};\nappendFileSync(process.env.JAIT_TRANSFER_FIXTURE_LOG,JSON.stringify({file:name,args:process.argv.slice(2)})+'\\n');\nif(process.env.JAIT_TRANSFER_FIXTURE_FAIL===name){console.error('fixture failure');process.exit(7);}\nconsole.log(name+' out');console.error(name+' err');\n`,{mode:0o700});
        process.env.PATH=base;
        let result;try{result=await m.transferProjectWithScp(call.input);}catch(error){const e=error as any;result={error:e.code===7?'fixture process exit 7':e.message};}
        return {result,calls:fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[]};
      } finally {
        if(before.path===undefined)delete process.env.PATH;else process.env.PATH=before.path;
        if(before.log===undefined)delete process.env.JAIT_TRANSFER_FIXTURE_LOG;else process.env.JAIT_TRANSFER_FIXTURE_LOG=before.log;
        if(before.fail===undefined)delete process.env.JAIT_TRANSFER_FIXTURE_FAIL;else process.env.JAIT_TRANSFER_FIXTURE_FAIL=before.fail;
        fs.rmSync(base,{recursive:true,force:true});
      }
    }
    case 'sourcereview.notificationNormalize':return m.normalizeNotificationDetail(call.raw);

    case 'sourcereview.networkRow':return m.containerResource(call.row,'observed');
    case 'sourcereview.networkCache': {
      const original=Date.now;let now=0,runs=0,failed=false;
      const inventory=new m.DockerResourceInventory(async()=>{runs++;if(failed)throw new Error('docker failed');return '';});
      try{
        Date.now=()=>now;
        const first=inventory.get(),joined=inventory.get();const a=await first,b=await joined;
        now=29999;const cached=await inventory.get();now=30000;const expired=await inventory.get();
        failed=true;now=60000;const failure=await inventory.get();failed=false;now=89999;const failureCached=await inventory.get();now=90000;const restored=await inventory.get();
        return {sameCachedObject:a===cached,sameJoinedObject:a===b,runs,statuses:[a,b,cached,expired,failure,failureCached,restored].map(x=>x.status)};
      }finally{Date.now=original;}
    }
    case 'sourcereview.networkCap': {
      const calls:string[][]=[];const ids=Array.from({length:514},(_,i)=>(i+1).toString(16).padStart(64,'0'));
      const inventory=new m.DockerResourceInventory(async(args:string[])=>{calls.push(args);return args[0]==='ps'?'invalid\n'+ids.join('\n')+'\n':'';});
      const result=await inventory.get();
      return {...result,calls:calls.length,batchSizes:calls.slice(1).map(x=>x.length-5),firstId:calls[1]?.[5],lastId:calls.at(-1)?.at(-1),inspectPrefix:calls[1]?.slice(0,3),ps:calls[0]};
    }
    case 'sourcereview.networkInvalid': {
      let calls=0;const inventory=new m.DockerResourceInventory(async()=>{calls++;return calls===1?'a'.repeat(64):'invalid json';});
      const first=await inventory.get(),second=await inventory.get();return {first,second,calls,sameCachedObject:first===second};
    }
    case 'sourcereview.maintenance': {
      const calls:unknown[]=[],notifications:unknown[]=[];
      const run=async(method:string,args:unknown[])=>{calls.push({method,args});if(call.error){if(call.primitive)throw call.error;throw new Error(call.error);}return call.results;};
      const service={runForRepo:(...args:unknown[])=>run('repo',args),runAll:(...args:unknown[])=>run('all',args)};
      const notify=(kind:string,args:unknown[])=>{notifications.push({kind,args});if(call.notificationError)throw new Error('notify failed');};
      const tool=m.createMaintenanceRunTool(service,call.disableNotifications?undefined:{success:(...a:unknown[])=>notify('success',a),warning:(...a:unknown[])=>notify('warning',a)});
      const original=Date.now;try{Date.now=()=>123;return {result:await tool.execute(call.input,call.manual?{}:{actionId:'action'}),calls,notifications};}finally{Date.now=original;}
    }

    case 'sourcereview.ollamaSetup': {
      const fs=await import('node:fs');const path=await import('node:path');const os=await import('node:os');
      const base=fs.mkdtempSync(path.join(new URL('../../../', import.meta.url).pathname,'.jait/artifacts/source-review','ollama-'));
      const previous=process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;const blocked=path.join(base,'blocked');
      try {
        const key=path.join(base,call.mode==='unreadable'?"a'b":call.mode==='blocked'?'blocked/key':'key');
        if(call.mode==='directory')fs.mkdirSync(key);
        else if(call.mode!=='missing'){
          if(call.mode==='blocked')fs.mkdirSync(blocked);
          fs.writeFileSync(key,'fixture content never read');
          if(call.mode==='unreadable')fs.chmodSync(key,0);
          if(call.mode==='blocked')fs.chmodSync(blocked,0);
        }
        process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=' '+key+' ';
        const result=await m.getOllamaUsageSetup(call.url??'http://localhost:11434');
        const user=os.userInfo();
        return {hostMatches:result.host===os.hostname(),userMatches:result.gatewayUser===user.username,platform:result.platform,local:result.local,keyStatus:result.keyStatus,keyPath:result.keyPath?.replaceAll(base,'BASE')??null,permissionCommand:result.permissionCommand?.replaceAll(base,'BASE').replace('u:'+user.uid+':r','u:UID:r')??null};
      } finally {
        if(fs.existsSync(blocked))fs.chmodSync(blocked,0o700);
        if(previous===undefined)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=previous;
        fs.rmSync(base,{recursive:true,force:true});
      }
    }

    case 'sourcereview.pluginSdk': {
      let executeArgs:unknown[]=[];const execute=(...args:unknown[])=>{executeArgs=args;return {ok:true,message:'fixture'};};
      const input={...call.tool,execute};const tool=m.toPluginToolDefinition(call.plugin,input);
      const executeResult=await tool.execute({value:1},{sessionId:'fixture'});
      return {metadata:m.buildPluginToolSourceMetadata(call.plugin),tool,callbackIdentity:tool.execute===execute,newObject:tool!==input,originalSource:input.source,executeResult,executeArgs};
    }
    case 'sourcereview.pluginEntry': {
      const calls:unknown[]=[];const setup=async(context:unknown)=>{calls.push(['setup',context]);if(call.fail)throw new Error('setup failed');return {settingsSchema:{type:'object'}};};
      const dispose=async()=>{calls.push(['dispose']);if(call.fail)throw new Error('dispose failed');};
      const entry=m.definePlugin({id:'fixture.plugin',displayName:'Fixture',setup,...(call.custom?{dispose}:{})});
      const result:any={id:entry.id,displayName:entry.displayName,setupIdentity:entry.setup===setup,disposeIdentity:call.custom?entry.dispose===dispose:null,calls};
      try{result.setupResult=await entry.setup({projectRoot:'fixture'});}catch(e){result.setupError=(e as Error).message;}
      try{result.disposed=(await entry.dispose())??null;}catch(e){result.disposeError=(e as Error).message;}return result;
    }
    case 'sourcereview.cronTool': {
      const calls:unknown[]=[];const record=(name:string,args:unknown[])=>{calls.push([name,...args]);if(call.fail)throw new Error('scheduler failed');};
      const scheduler={
        create(...args:unknown[]){record('create',args);return {id:'created'};},
        list(...args:unknown[]){record('list',args);return call.jobs??[];},
        remove(...args:unknown[]){record('remove',args);return call.removed??false;},
        update(...args:unknown[]){record('update',args);return call.updated??null;}
      };
      const method='createCron'+call.action[0].toUpperCase()+call.action.slice(1)+'Tool';
      try{return {result:await m[method](scheduler).execute(call.input,{userId:'user',projectRoot:'/fixture/project'}),calls};}
      catch(e){return {threw:(e as Error).message,calls};}
    }
    case 'sourcereview.sqlTool': {
      const calls:unknown[]=[];const service={schema(){calls.push(['schema']);return call.response;},query(input:unknown){calls.push(['query',input]);return call.response;}};
      return {result:await m.createSessionSqlTool(service).execute(call.input,{}),calls};
    }

    case 'sourcereview.smokeProcess':{
      const {EventEmitter,once}=await import('node:events');
      if(call.mode==='states')return [m.hasExited(null),m.hasExited({exitCode:null,signalCode:null}),m.hasExited({exitCode:0,signalCode:null}),m.hasExited({exitCode:null,signalCode:'SIGTERM'})];
      if(call.mode==='sync'){
        class Child extends EventEmitter {exitCode:number|null=null;signalCode=null;killCount=0;listenersAtKill=0;kill(){this.killCount++;this.listenersAtKill=this.listenerCount('exit');this.exitCode=0;this.emit('exit',0,null);}}
        const child=new Child();await m.terminateChild(child);await m.terminateChild(child);return {killCount:child.killCount,listenersAtKill:child.listenersAtKill,exitListeners:child.listenerCount('exit'),after:m.hasExited(child)};
      }
      const {spawn}=await import('node:child_process');
      const child=spawn(nodeBinary,['-e',"process.stdout.write('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','pipe'],env:{LANG:'C.UTF-8'}});
      const failed=new Promise((_,reject)=>child.once('error',(e:Error)=>reject(new Error('fixture child spawn failed ('+nodeBinary+'): '+e.message))));
      try{await Promise.race([once(child.stdout,'data'),failed]);const before=m.hasExited(child);await m.terminateChild(child);await m.terminateChild(child);return {before,after:m.hasExited(child),exitCode:child.exitCode,signal:child.signalCode};}
      finally{if(!m.hasExited(child))child.kill('SIGKILL');}
    }

    case 'sourcereview.httpRoutes': {
      const {default:Fastify}=await import('../../../packages/gateway/node_modules/fastify/fastify.js');
      const auth=await import(new URL('packages/gateway/src/security/http-auth.ts',new URL('../../../', import.meta.url)).href);
      const token=await auth.signAuthToken({id:'user',username:'fixture'},'fixture-route-secret');
      const config={jwtSecret:'fixture-route-secret'};const app=Fastify({logger:false});const events:unknown[]=[];
      const initialState={halted:false,reason:null,haltedAt:null,updatedAt:12};
      let controlState:any=initialState;
      if(call.module==='agentControlRoutes'){
        m.registerAgentControlRoutes(app,config,{
          agentControl:{
            getState(user:unknown){events.push(['get',user]);return controlState;},
            async halt(user:unknown,options:any){events.push(['halt',user,options]);controlState={halted:true,reason:options.reason,haltedAt:'halt-time',updatedAt:12};return {state:controlState,stopped:2,stopError:call.partial?'fixture runner failed':null};},
            resume(user:unknown){events.push(['resume',user]);controlState=initialState;return controlState;}
          },
          audit:{write(record:unknown){events.push(['audit',record]);if(call.auditError)throw new Error('audit failed');}}
        });
      }else if(call.module==='pluginRoutes'){
        let current={keep:'old',overwrite:1,nested:{a:1}};
        const fail=()=>{if(call.fail){if(call.primitive)throw 'primitive failure';throw new Error('manager failed');}};
        m.registerPluginRoutes(app,config,{
          listInstalled(){events.push(['list']);return [{id:'p',status:'disabled'}];},
          getPlugin(id:unknown){events.push(['get',id]);return call.missing?null:{id,config:current};},
          async enable(id:unknown){events.push(['enable',id]);fail();return {id,enabled:true};},
          async disable(id:unknown){events.push(['disable',id]);fail();return {id,enabled:false};},
          async uninstall(id:unknown){events.push(['uninstall',id]);fail();},
          getPluginConfig(id:unknown){events.push(['getConfig',id]);fail();return current;},
          async setPluginConfig(id:unknown,value:any){events.push(['setConfig',id,value]);fail();current=value;},
          async syncAndLoad(){events.push(['scan']);}
        });
      }else if(call.module==='screenShareRoutes'){
        const session={id:'share',active:true};
        const record=(name:string,...args:unknown[])=>{events.push([name,...args]);if(call.fail===name){if(call.primitive)throw 'fixture failed';throw new Error('fixture failed');}};
        m.registerScreenShareRoutes(app,{
          screenShare:{
            getState(){record('state');return {devices:[{id:'d'}],id:null};},
            registerDevice(input:unknown){record('register',input);return input;},
            startShare(input:unknown){record('start',input);return session;},
            transferControl(id:unknown){record('control',id);return session;},
            stopShare(){record('stop');return call.emptyStop?null:session;},
            captureScreen(){record('capture');return {data:'fixture'};},
            startRecording(){record('record');return {id:'record'};}
          },
          ws:{broadcastScreenShareState(value:unknown){record('broadcast',value);},sendScreenShareStartRequest(...args:unknown[]){record('requestStart',...args);}}
        });
      }else if(call.module==='maintenanceRoutes'){
        const result={id:'run',repoName:'Repo',allPassed:!call.failed,planId:call.failed?'plan':null,checks:[{name:'types',passed:!call.failed,durationMs:12}]};
        m.registerMaintenanceRoutes(app,config,{
          maintenanceService:{
            listRuns(jobId:unknown,limit:unknown){events.push(['list',jobId,limit]);return [];},
            getRun(id:unknown){events.push(['get',id]);return call.missing?null:result;},
            async runForRepo(id:unknown,jobId:string){events.push(['run',id,/^manual-\d+$/.test(jobId)]);if(call.error)throw new Error('maintenance failed');return result;}
          },
          notifications:{success(...args:unknown[]){events.push(['success',...args]);},warning(...args:unknown[]){events.push(['warning',...args]);}},
          ws:{broadcastAll(event:any){events.push(['broadcast',{...event,timestamp:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.timestamp)?'<time>':event.timestamp}]);}}
        });
      }else throw new Error('unregistered HTTP fixture');
      try{
        const responses=[];
        for(const original of call.requests){
          const {auth:authenticated,...request}=original;
          request.headers={...request.headers,...(authenticated===false?{}:{authorization:'Bearer '+token})};
          const response=await app.inject(request);responses.push({status:response.statusCode,body:response.json()});
        }
        return {responses,events};
      }finally{await app.close();}
    }

    case 'sourcereview.messengerBridge': {
      const bridge=new m.MessengerBridge(),controller=new AbortController();const sent:unknown[]=[],gatewayCalls:unknown[]=[],requestIds:string[]=[];
      const now=Date.now;Date.now=()=>100;
      const capture=(client:string,request:any)=>{
        requestIds.push(request.requestId);sent.push({client,request:{...request,requestId:/^[0-9a-f-]{36}$/.test(request.requestId)?'<uuid>':request.requestId}});
        if(call.mode==='busy')return;
        if(call.mode==='timeout')return;
        if(call.mode==='throw')throw new Error('send failed');
        if(call.mode==='disconnect'){bridge.unregister(client);return;}
        if(call.mode==='replace'){bridge.register(client,{userId:'user',active:()=>true,send:()=>{}});return;}
        if(call.mode==='cancel'){controller.abort();return;}
        if(call.mode==='mismatch'){
          bridge.complete('other','user',request.requestId,{ok:true,message:'wrong client'});
          bridge.complete(client,'other',request.requestId,{ok:true,message:'wrong owner'});
          bridge.complete(client,'user','wrong request',{ok:true,message:'wrong request'});
          bridge.complete(client,'user',request.requestId,{ok:'yes',message:'wrong shape'});
        }
        const response=call.mode==='oversized'?{ok:true,message:'large',data:'x'.repeat(150001)}:{ok:true,message:call.mode==='longMessage'?'x'.repeat(2001):'browser result',data:{fixture:true},discard:'extra'};
        bridge.complete(client,client==='foreign'?'other':'user',request.requestId,response);
      };
      try{
        if(call.mode==='gateway')bridge.setGatewayHandler(async(user:unknown,command:unknown,signal:unknown)=>{gatewayCalls.push({user,command,sameSignal:signal===controller.signal});return {ok:true,message:'gateway'};});
        if(call.mode!=='validation'){
          bridge.register('foreign',{userId:'other',active:()=>true,send:(request:any)=>capture('foreign',request)});
          bridge.register('owner',{userId:'user',active:()=>call.mode!=='none',send:(request:any)=>capture('owner',request)});
          if(['multiple','gateway'].includes(call.mode))bridge.register('second',{userId:'user',active:()=>true,send:(request:any)=>capture('second',request)});
        }
        if(call.aborted)controller.abort();
        let value;
        if(call.mode==='busy'){const pending=[];for(let i=0;i<33;i++)pending.push(bridge.request('user',{action:'status'},controller.signal,1000));bridge.stop();value=await Promise.all(pending);}
        else value=await bridge.request(call.missingUser?undefined:'user',call.input??{action:'status'},controller.signal,call.mode==='timeout'?0:1000);
        return {result:value,sent,gatewayCalls,uniqueRequests:new Set(requestIds).size};
      }finally{bridge.stop();Date.now=now;}
    }

    case 'sourcereview.subscriptionFetchers': {
      const original=globalThis.fetch;const calls:unknown[]=[];let cancelled=0,reads=0;
      let html=call.html??'';
      if(call.padTo)html=html.padEnd(call.padTo,' ');
      if(call.multibyte)html='😀'.repeat(call.multibyte)+html;
      const bytes=new TextEncoder().encode(html);let position=0;
      globalThis.fetch=Object.assign(async(input:unknown,options:any={})=>{
        calls.push({url:String(input),headers:options.headers,redirect:options.redirect,signalPresent:Boolean(options.signal&&typeof options.signal.aborted==='boolean'),signalAborted:options.signal.aborted});
        const body=call.response===undefined?null:structuredClone(call.response);
        if(call.nonfinite&&body)body.usage.rolling.percent=NaN;
        const status=call.status??200;
        return {status,ok:status>=200&&status<300,async json(){return body;},body:call.empty?null:{getReader(){return {
          async read(){reads++;if(call.readError&&position>0)throw new Error('fixture stream failed');if(position++===0)return {value:bytes,done:false};return {done:true};},
          async cancel(){cancelled++;}
        };}}} as any;
      },{preconnect:original.preconnect});
      try{
        let output;
        if(call.mode==='cookie'){const raw=call.length?'x'.repeat(call.length):call.input;const normalized=m.normalizeOllamaSession(raw);output=call.length?normalized.length:normalized;}
        else if(call.mode==='parse')output=m.parseOllamaSettingsUsage(html);
        else if(call.mode==='go')output=await m.fetchOpenCodeGoUsage('fixture-go-key');
        else output=await m.fetchOllamaSettingsUsage(' __Secure-session=fixture-cookie ');
        return {value:output,calls,cancelled,reads};
      }catch(e){return {error:(e as Error).message,calls,cancelled,reads};}
      finally{globalThis.fetch=original;}
    }

    case 'sourcereview.skills':
      return call.kind === 'constant' ? m.SKILL_DISCOVERY_INSTRUCTIONS : m.formatSkillsForPrompt(call.skills ?? []);

    case 'sourcereview.modelResult': {
      if (call.kind === 'project') return m.projectModelData(call.data);
      if (call.kind === 'bound') {
        const value = m.boundModelData(call.data, call.max);
        const o = value ?? {};
        return {
          truncated: o.truncated === true, originalChars: o.originalChars ?? null,
          previewChars: typeof o.preview === 'string' ? o.preview.length : null,
          preview: typeof o.preview === 'string' ? o.preview : null,
          ok: o.ok ?? null, exitCode: o.exitCode ?? null, timedOut: o.timedOut ?? null,
          needsInteraction: o.needsInteraction ?? null, terminalId: o.terminalId ?? null,
          outputOffset: o.outputOffset ?? null, outputEndOffset: o.outputEndOffset ?? null,
          jsonLength: JSON.stringify(value).length,
        };
      }
      return m.serializeToolResultForModel(call.result);
    }

    case 'sourcereview.usage': {
      const u1 = { inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 };
      const u2 = { inputTokens: 150, outputTokens: 20, cachedInputTokens: 60, requestCount: 2 };
      const total1 = m.parseCodexUsage({ msg: { tokenUsage: {
        total: { inputTokens: 188328, outputTokens: 797, cachedInputTokens: 157184, requestCount: 6 },
        last: { inputTokens: 26210, outputTokens: 62, cachedInputTokens: 7168, requestCount: 1 } } } });
      const total2 = { inputTokens: 200000, outputTokens: 859, cachedInputTokens: 165184, requestCount: 7, scope: 'session' };
      const probe = (u: any) => u ? {
        inputTokens: u.promptTokens, outputTokens: u.completionTokens, totalTokens: u.totalTokens,
        cachedPromptTokens: u.cachedPromptTokens ?? -1, requestCount: u.requestCount ?? -1,
      } : { inputTokens: -1, outputTokens: -1, totalTokens: -1, cachedPromptTokens: -1, requestCount: -1 };
      if (call.kind === 'parse') return {
        codex: m.parseCodexUsage(call.params) ?? null,
        flat: m.parseCodexUsage({ tokenUsage: { total_token_usage: { input_tokens: 800, output_tokens: 40, cachedReadTokens: 800 } } }) ?? null,
        acp: m.parseAcpUsage(call.acp, 'turn-1') ?? null,
      };
      if (call.kind === 'rejects') return {
        cachedOverInput: m.parseCodexUsage({ tokenUsage: { total: { inputTokens: 10, outputTokens: 1, cachedInputTokens: 11 } } }) === undefined,
        missingOutput: m.parseCodexUsage({ tokenUsage: { total: { inputTokens: 10 } } }) === undefined,
        overSafe: m.parseAcpUsage({ inputTokens: 9007199254740992, outputTokens: 1 }, 'turn-1') === undefined,
      };
      if (call.kind === 'scenarios') {
        const a = new m.TurnUsageAccumulator(total1, false); a.add(total2);
        const charged = probe(a.metrics(9000));
        a.add(total1); a.add(total2);
        const afterRepeat = probe(a.metrics(9000));
        const b = new m.TurnUsageAccumulator(undefined, false); b.add(total1);
        const resumed = probe(b.metrics(9000));
        const c = new m.TurnUsageAccumulator(total1, true);
        const freshFirst = probe(c.metrics(9000)); c.add(total2);
        const freshAfter = probe(c.metrics(9000));
        const t = new m.TurnUsageAccumulator(undefined, false);
        t.add(m.parseAcpUsage(u1, 'turn-1')); t.add(m.parseAcpUsage(u2, 'turn-1'));
        t.add(m.parseAcpUsage({ inputTokens: 200, outputTokens: 20 }, 'turn-2'));
        const turn = probe(t.metrics(5000));
        return { charged, afterRepeat, resumed, freshFirst, freshAfter, turn, baselineAfterTurns: t.baseline ?? null };
      }
      const l = new m.TurnUsageAccumulator(undefined, false); l.add(total1);
      const s = l.metrics(4321);
      return {
        tokenUsageEstimated: s?.tokenUsageEstimated ?? null,
        totalMatches: s ? s.totalTokens === s.promptTokens + s.completionTokens : null,
        requestCount: s?.requestCount ?? -1,
        cachedPromptTokens: s?.cachedPromptTokens ?? -1,
        durationMs: s?.durationMs ?? -1,
      };
    }

    default: throw new Error('unknown source review operation');
  }
}
