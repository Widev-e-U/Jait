/** Bounded observation bridge. Rust owns inputs, assertions and mutation controls. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { persistSubAgentHistories } from '../../../packages/gateway/src/lib/sub-agent-persistence.ts';
import { serializePersistedToolCalls } from '../../../packages/gateway/src/lib/persisted-tool-calls.ts';
import { recoveryPlan } from './migration-recovery.ts';

console.log = (...args) => console.error(...args);
const directory = process.env.JAIT_STATE_DIR!;
mkdirSync(directory, {recursive:true});
// Sits just under the Rust-side driver deadline so a hung bridge reports here first.
// Sized for headroom: the heaviest call (messenger.recover count=50000) takes ~17.5s
// unloaded, and the ladder runs this suite beside vitest and other cargo suites.
setTimeout(() => { console.error('migration bridge exceeded deadline'); process.exit(124); }, 100000).unref();
async function dispatch(call: any): Promise<unknown> {
  switch (call.op) {
    case 'recovery.plan': return recoveryPlan(call.actions);
    case 'toolcalls.serialize': return serializePersistedToolCalls(call.raw, call.options);
    case 'history.persist': {
      const {db, sqlite} = await openDatabase(join(directory, 'histories.db'));
      try {
        migrateDatabase(sqlite);
        for (const step of call.steps) {
          if (step.sql) sqlite.exec(step.sql);
          else persistSubAgentHistories(db, step.session, step.message, step.raw);
        }
        return sqlite.prepare('SELECT * FROM sub_agent_history ORDER BY sub_agent_id').all();
      } finally { sqlite.close(); }
    }
    case 'mcp.manager': return (await import('./migration-mcp.ts')).exerciseMcpManager(call);
    case 'watcher.case': return (await import('./migration-watcher.ts')).watchCaseSensitiveFiles();
    case 'terminal.pty': return (await import('./migration-pty.ts')).ptyLifecycle(call);
    case 'mcp.exercise': return (await import('./migration-mcp.ts')).exerciseMcp(call);
    case 'acp.launch': return (await import('./migration-acp.ts')).launchAcp(call);
    case 'messenger.recover': return (await import('./migration-messenger.ts')).recoverHistory(call);
    case 'forge.workflow': return (await import('./migration-forge.ts')).forgeWorkflow(call);
    case 'git.workflow': return (await import('./migration-git.ts')).gitWorkflow(call);
    default: return {unsupported:call.op,backend:'bun'};
  }
}
const request = JSON.parse(await Bun.stdin.text());
if (request.version !== 1 || !Array.isArray(request.calls) || request.calls.length > 64) throw new Error('invalid protocol');
const results: unknown[]=[];
for (const call of request.calls) results.push(await dispatch(call));
process.stdout.write(JSON.stringify({version:1,results}));
