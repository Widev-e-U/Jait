import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillRegistry } from "./index.js";
import { renderSkillMarkdown, slugifySkillId, writeUserSkill } from "./install.js";

describe("skill ids", () => {
  it("slugifies a display name into a directory name", () => {
    expect(slugifySkillId("Feuerwehr Instagram Posts")).toBe("feuerwehr-instagram-posts");
    expect(slugifySkillId("  Weather   Warnings  ")).toBe("weather-warnings");
  });

  it("strips anything that could climb out of the skills directory", () => {
    expect(slugifySkillId("../../etc/passwd")).toBe("etc-passwd");
    expect(slugifySkillId("/absolute/path")).toBe("absolute-path");
    expect(slugifySkillId("..")).toBe("");
  });
});

describe("rendered SKILL.md", () => {
  it("quotes the frontmatter so a colon does not become a nested mapping", () => {
    const md = renderSkillMarkdown({
      name: "Deploy: staging",
      description: 'Use when shipping to staging: run the "safe" path.',
      body: "# Steps\n\n1. Do the thing.",
    });

    expect(md).toContain('name: "Deploy: staging"');
    expect(md).toContain('description: "Use when shipping to staging: run the \\"safe\\" path."');
    expect(md).toContain("1. Do the thing.");
  });

  it("flattens a multi-line description onto the single line YAML expects", () => {
    const md = renderSkillMarkdown({ name: "X", description: "first\nsecond", body: "body" });
    expect(md).toContain('description: "first second"');
  });
});

describe("writeUserSkill", () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "jait-skills-"));
    previousHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    await rm(home, { recursive: true, force: true });
  });

  it("writes a skill and makes it discoverable in the same breath", async () => {
    const registry = new SkillRegistry();
    const written = await writeUserSkill({
      skillRegistry: registry,
      id: "Bysenft Auslastung",
      name: "Bysenft Auslastung",
      description: "Use when asked how busy bysenft.at is.",
      body: "Fetch https://bysenft.at and read the occupancy widget.",
    });

    expect(written).toMatchObject({ id: "bysenft-auslastung", created: true });
    expect(await readFile(written.filePath, "utf-8")).toContain("occupancy widget");

    const registered = registry.get("bysenft-auslastung");
    expect(registered).toMatchObject({ name: "Bysenft Auslastung", enabled: true, source: "user" });
  });

  it("refuses to clobber knowledge that took a conversation to get right", async () => {
    const registry = new SkillRegistry();
    const params = {
      skillRegistry: registry,
      id: "notes",
      name: "Notes",
      description: "Use when taking notes.",
      body: "original",
    };
    await writeUserSkill(params);

    await expect(writeUserSkill({ ...params, body: "replacement" })).rejects.toThrow(/already exists/);

    const kept = await readFile(join(home, ".jait", "skills", "notes", "SKILL.md"), "utf-8");
    expect(kept).toContain("original");
  });

  it("replaces on request, and says it replaced rather than created", async () => {
    const registry = new SkillRegistry();
    const params = { skillRegistry: registry, id: "notes", name: "Notes", description: "d", body: "original" };
    await writeUserSkill(params);

    const second = await writeUserSkill({ ...params, body: "replacement", overwrite: true });

    expect(second.created).toBe(false);
    expect(await readFile(second.filePath, "utf-8")).toContain("replacement");
  });

  it("rejects an id that slugifies to nothing", async () => {
    await expect(writeUserSkill({
      skillRegistry: new SkillRegistry(),
      id: "...",
      name: "X",
      description: "d",
      body: "b",
    })).rejects.toThrow(/usable skill id/);
  });
});
