// Rust owns the assertions; this fixture runs the real Node updater and ESM loader.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { prepareUpdate, activateUpdate, run } from "../../../packages/gateway/bin/safe-update.mjs";

const [directory, mode] = process.argv.slice(2);
const live = join(directory, "gateway");
const events = [];
async function packageAt(root, version) {
  for (const child of ["bin", "dist", "web-dist"]) await mkdir(join(root, child), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@jait/gateway", type: "module", version }));
  await writeFile(join(root, "bin/jait.mjs"), `console.log(${JSON.stringify(version)});`);
  await writeFile(join(root, "dist/index.js"), "export {};");
  await writeFile(join(root, "web-dist/index.html"), "<html>ready</html>");
}
await packageAt(live, "0.1.956");
await writeFile(join(live, "preserved.txt"), "working installation");
let plan;
let error;
try {
  plan = await prepareUpdate({ live, runCommand: async (command, args, options) => {
    if (args[0] !== "install") {
      events.push(args[0] === "--check" ? "syntax" : args[0] === "--input-type=module" ? "link" : "version");
      return run(command, args, options);
    }
    const stage = args[args.indexOf("--prefix") + 1];
    const candidate = join(stage, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@jait/gateway");
    await packageAt(candidate, "0.1.957");
    const shared = join(candidate, "node_modules/@jait/shared");
    await mkdir(shared, { recursive: true });
    await writeFile(join(shared, "package.json"), JSON.stringify({ name: "@jait/shared", type: "module", exports: "./index.js" }));
    await writeFile(join(shared, "index.js"), mode === "missing-export"
      ? "export const oldApi = true;"
      : 'export const sessionWaitLabel = () => "Waiting for consent";');
    await writeFile(join(candidate, "dist/index.js"), `
      import { sessionWaitLabel } from "@jait/shared";
      import { writeFileSync } from "node:fs";
      if (!process.env.__JAIT_CLI) writeFileSync(${JSON.stringify(join(directory, "started"))}, "unexpected startup");
      if (sessionWaitLabel() !== "Waiting for consent") throw new Error("incorrect shared API");
    `);
  } });
  await activateUpdate(plan, {
    stop: async () => { events.push("stop"); },
    restart: async () => { events.push("restart"); },
    health: async (_port, version) => {
      events.push(`health:${version}`);
      if (mode === "startup-failure" && version === "0.1.957") throw new Error("startup failed");
    },
  });
} catch (caught) {
  error = String(caught);
}
const exists = async (path) => access(path).then(() => true, () => false);
console.log(JSON.stringify({
  error, events,
  version: JSON.parse(await readFile(join(live, "package.json"), "utf8")).version,
  lockExists: await exists(`${live}.update-lock`),
  started: await exists(join(directory, "started")),
  preserved: await exists(join(live, "preserved.txt")),
  previousPreserved: plan ? await exists(join(plan.backup, "preserved.txt")) : false,
  result: plan ? JSON.parse(await readFile(join(plan.stage, "result.json"), "utf8")) : null,
}));
