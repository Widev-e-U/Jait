import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Run in real Node ESM: Vitest/Bun synthesize CommonJS named exports and
// would hide the import failure that occurs inside packaged Electron.
describe("native Windows input binding", () => {
  it("loads Koffi in Node ESM and encodes mouse and keyboard INPUT unions", () => {
    const output = execFileSync("node", ["--experimental-transform-types", "--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import koffi from "koffi";
      import { createWindowsInput } from "./windows-native-input.ts";
      const events = [];
      let cursor = { x: -100, y: 200 };
      koffi.load = () => ({ func(prototype) {
        if (prototype.includes("GetCursorPos")) return pos => { Object.assign(pos, cursor); return true; };
        if (prototype.includes("SetCursorPos")) return (x, y) => { cursor = { x, y }; return true; };
        if (prototype.includes("SendInput")) return (count, inputs, size) => {
          for (const input of inputs) {
            const buffer = Buffer.alloc(size);
            koffi.encode(buffer, "JaitINPUT", input);
            events.push(koffi.decode(buffer, "JaitINPUT"));
          }
          return count;
        };
        throw new Error(prototype);
      }});
      Object.defineProperty(process, "platform", { value: "win32" });
      const input = await createWindowsInput();
      assert.deepEqual(input.getCursorPos(), cursor);
      input.setCursorPos(-200, 400);
      assert.deepEqual(input.getCursorPos(), { x: -200, y: 400 });
      input.mouseButton("left", true);
      input.mouseButton("left", false);
      input.keyVirtual(65, true);
      input.typeUnicode("A");
      input.scroll("down", 1);
      assert.equal(events[0].u.mi.dwFlags, 2);
      assert.equal(events[1].u.mi.dwFlags, 4);
      assert.equal(events[2].u.ki.wVk, 65);
      assert.equal(events[3].u.ki.wScan, 65);
      assert.equal(events[5].u.mi.mouseData, 4294967176);
      const second = await createWindowsInput();
      assert.deepEqual(second.getCursorPos(), cursor);
      console.log("native binding passed");
    `], { cwd: fileURLToPath(new URL(".", import.meta.url)), encoding: "utf8", timeout: 20_000 });
    expect(output).toContain("native binding passed");
  });
});
