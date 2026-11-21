import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_RESCAN_INTERVAL_MS, SkillRegistry } from "./index.js";

const artifactDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../.jait/artifacts/skill-registry-tests");
mkdirSync(artifactDir, { recursive: true });

function writeSkill(root: string, id: string, description = "does things") {
  mkdirSync(join(root, id), { recursive: true });
  writeFileSync(join(root, id, "SKILL.md"), `---\nname: ${id}\ndescription: ${description}\n---\nbody\n`);
}

describe("SkillRegistry live rescan", () => {
  test("picks up added and removed skills without a restart and keeps enabled choices", async () => {
    const root = mkdtempSync(join(artifactDir, "jait-skills-"));
    try {
      writeSkill(root, "first");
      const registry = new SkillRegistry();
      await registry.discover([{ path: root, source: "user" }]);
      expect(registry.list().map((s) => s.id)).toEqual(["first"]);

      registry.setEnabled("first", false);
      writeSkill(root, "second");
      // Within the throttle window nothing changes.
      expect(registry.get("second")).toBeUndefined();

      const realNow = Date.now;
      Date.now = () => realNow() + SKILL_RESCAN_INTERVAL_MS + 1;
      try {
        expect(registry.get("second")?.enabled).toBe(true);
        expect(registry.get("first")?.enabled).toBe(false);
        rmSync(join(root, "second"), { recursive: true });
        Date.now = () => realNow() + 2 * (SKILL_RESCAN_INTERVAL_MS + 1);
        expect(registry.get("second")).toBeUndefined();
      } finally {
        Date.now = realNow;
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps plugin-added skills across rescans", async () => {
    const root = mkdtempSync(join(artifactDir, "jait-skills-"));
    try {
      const registry = new SkillRegistry();
      await registry.discover([{ path: root, source: "user" }]);
      registry.add({ id: "plug", name: "plug", description: "d", filePath: "/x/SKILL.md", source: "plugin", enabled: true });
      registry.rescan();
      expect(registry.get("plug")).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
