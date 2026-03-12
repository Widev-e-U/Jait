import Database from "/home/jakob/.npm-global/lib/node_modules/@jait/gateway/node_modules/better-sqlite3/lib/index.js";
const db = new Database("/home/jakob/.jait/data/jait.db");
const interrupted = db.prepare("SELECT id, title, status, error FROM agent_threads WHERE status = 'interrupted'").all();
console.log("Interrupted threads:", JSON.stringify(interrupted, null, 2));
const all = db.prepare("SELECT status, COUNT(*) as count FROM agent_threads GROUP BY status").all();
console.log("Status counts:", JSON.stringify(all));
