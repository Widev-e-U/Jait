// Bun-only bootstrap. Configuration arrives over stdin, never command arguments.
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";

let input = "";
for await (const chunk of process.stdin) input += chunk.toString();
const settings = JSON.parse(input);
const state = process.env.JAIT_STATE_DIR!;
if (!state || process.env.JAIT_DB_PATH !== path.join(state, "data/jait.db")) throw new Error("Evaluation database isolation required");
const { db, sqlite } = await openDatabase(process.env.JAIT_DB_PATH);
migrateDatabase(sqlite);
const users = new UserService(db);
const user = users.createUser("evaluation", randomUUID());
users.updateSettings(user.id, {
  apiKeys: settings.api_keys, disabledTools: settings.disabled_tools,
  jaitBackend: settings.jait_backend, selectedModel: settings.selected_model,
  reasoningEffort: settings.reasoning_effort,
});
const token = await signAuthToken(user, process.env.JWT_SECRET!);
sqlite.close();
const { main } = await import("../index.js");
await main({ evaluation: true, onReady(port) {
  console.log("JAIT_EVAL_READY " + JSON.stringify({ port, token }));
} });
