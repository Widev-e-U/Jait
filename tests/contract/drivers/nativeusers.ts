/** Disposable repository fixture. Rust owns assertions and native operations. */
import { mkdirSync, realpathSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrateDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';
import { createHash, scryptSync } from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = join(root,'.jait/artifacts/gateway-rust/native-users');
type Step = {kind:string; user?:string; username?:string; password?:string; patch?:unknown; project?:string|null; session?:string|null; token?:string; key?:string;};
type Call = {op:string;id:string;seed?:string;steps?:Step[];file?:string;username?:string;password?:string;};
export async function dispatch(call:Call):Promise<unknown> {
  if (!/^[a-z0-9-]{1,64}$/.test(call.id)) throw new Error('fixture ID required');
  const dir = join(base,call.id);mkdirSync(dir,{recursive:true});
  if (realpathSync(dir)!==dir) throw new Error('fixture symlink rejected');
  const now = '2026-10-18T12:00:00.000Z';
  const DateOriginal=globalThis.Date;
  globalThis.Date=class extends DateOriginal {
    constructor(value?:string|number) {super(value===undefined?now:value);}
    static now() {return new DateOriginal(now).getTime();}
  } as DateConstructor;
  const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    if (call.op==='nativeusers.reopen') {
      if (call.file!==join(dir,'native.db') || realpathSync(call.file)!==call.file) throw new Error('owned fixture required');
      const {db,sqlite}=await openDatabase(call.file);
      try {
        const users=new UserService(db);
        const user=users.verifyCredentials(call.username!,call.password!);
        return user ? {username:user.username,settings:users.getSettings(user.id)} : null;
      } finally {sqlite.close();}
    }
    if (call.op!=='nativeusers.sequence') throw new Error('unknown native users operation');
    const reference=join(dir,'reference.db'),native=join(dir,'native.db');
    const {db,sqlite}=await openDatabase(reference);
    try {
      migrateDatabase(sqlite);
      const salt='0123456789abcdef0123456789abcdef';
      const hash='scrypt$'+salt+'$'+scryptSync('password 🦀',salt,64).toString('hex');
      sqlite.prepare("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)").run('owner','alice',hash,'2026-10-18T11:59:59.000Z',now);
      sqlite.prepare("INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)").run('other','bob',hash,now,now);
      if (call.seed) sqlite.exec(call.seed);
      sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      copyFileSync(reference,native);
      const users=new UserService(db);
      const invitations=new Map<string,string>();
      const results=[];
      for (const step of call.steps??[]) {
        switch(step.kind) {
          case 'count':results.push(users.countUsers());break;
          case 'owner':results.push(users.isOwner(step.user!));break;
          case 'find':results.push(users.findByUsername(step.username!));break;
          case 'id':results.push(users.findById(step.user!));break;
          case 'verify':results.push(users.verifyCredentials(step.username!,step.password!));break;
          case 'settings':results.push(users.getSettings(step.user!));break;
          case 'patch':results.push(users.updateSettings(step.user!,step.patch as any));break;
          case 'selection':results.push(users.getLastSelection(step.user!));break;
          case 'select':users.setLastSelection(step.user!,step.project??null,step.session??null);results.push(null);break;
          case 'bind':results.push(users.bindSessionToUser(step.user!,step.session!));break;
          case 'archive':results.push(users.clearArchivedSessions(step.user!));break;
          case 'invite': {
            const token=users.createInvitation(step.user!);
            if (!token) {results.push(null);break;}
            invitations.set(step.key!,token);
            const row=sqlite.prepare('SELECT token_hash,created_by,expires_at FROM account_invitations WHERE token_hash=?').get(createHash('sha256').update(token).digest('hex')) as any;
            results.push({length:token.length,urlSafe:/^[A-Za-z0-9_-]+$/.test(token),hashed:row.token_hash!==token,creator:row.created_by,expiry:row.expires_at});break;
          }
          case 'consume':results.push(users.consumeInvitation(invitations.get(step.key!)??step.token??''));break;
          default:throw new Error('unknown repository step');
        }
      }
      return {native,reference,hash,now,results};
    } finally {sqlite.close();}
  } finally {globalThis.Date=DateOriginal;console.log=log;}
}
