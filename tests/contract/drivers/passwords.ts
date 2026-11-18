/** Observations for stored-password reference tests; Rust owns the predicates. */
import { scryptSync } from 'node:crypto';
import { openDatabase, migrateDatabase, type SqliteDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { UserService } from '../../../packages/gateway/src/services/users.ts';

export async function dispatch(call: any): Promise<unknown> {
  if (call.op !== 'passwords.verify') throw new Error('unknown password fixture operation');
  const salt = '0123456789abcdef0123456789abcdef';
  const digest = scryptSync('correct password 🦀', salt, 64).toString('hex');
  const log = console.log;
  console.log = () => {};
  let sqlite: SqliteDatabase | undefined;
  try {
    const opened = await openDatabase(':memory:');
    sqlite = opened.sqlite;
    migrateDatabase(opened.sqlite);
    const users = new UserService(opened.db);
    opened.sqlite.prepare('INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run('owner', 'alice', `scrypt$${salt}$${digest}`, 'now', 'now');
    if (call.digest) {
      // These are the original fixture expressions, evaluated before the call.
      const fixture = call.digest.kind === 'uppercase' ? digest.toUpperCase()
        : call.digest.kind === 'truncate' ? digest.slice(0, -2)
        : call.digest.kind === 'append' ? digest + call.digest.value
        : call.digest.value;
      opened.sqlite.prepare("UPDATE users SET password_hash=? WHERE id='owner'")
        .run(`scrypt$${salt}$${fixture}`);
    }
    // An undefined return omits value and therefore fails Rust's required path;
    // it cannot be accidentally normalized into the null required by the test.
    return call.credentials.map((entry: any) => ({
      value: users.verifyCredentials(entry.username, entry.password),
    }));
  } finally {
    sqlite?.close();
    console.log = log;
  }
}
