import { expect, it } from "vitest";
import { runAuthCommand } from "./provider-auth.js";

it.each([
  { code: 0, output: "signed out", ok: true, message: "Logout completed." },
  { code: 7, output: "logout refused", ok: false, message: "Command exited with code 7." },
  { code: 0, output: "", ok: true, message: "Logout completed." },
])("reports auth subprocess completion: $code / $output", async ({ code, output, ok, message }) => {
  const result = await runAuthCommand("codex", JSON.stringify(process.execPath), [
    "-e", `process.stdout.write(${JSON.stringify(output)}); process.exitCode = ${code};`,
  ], 5000);
  expect(result).toMatchObject({ providerId: "codex", ok, message, status: ok ? "completed" : "error" });
  expect(result.rawOutput).toBe(output || undefined);
});
