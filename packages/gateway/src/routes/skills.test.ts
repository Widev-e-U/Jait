import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../skills/index.js";
import { registerSkillRoutes } from "./skills.js";

describe("skill routes", () => {
  it("lists discovered skills and toggles their enabled state", async () => {
    const app = Fastify();
    const skillRegistry = new SkillRegistry();
    skillRegistry.add({
      id: "word-docx",
      name: "Word / DOCX",
      description: "Handle DOCX files without formatting drift.",
      filePath: "C:/skills/word-docx/SKILL.md",
      source: "user",
      enabled: true,
    });

    registerSkillRoutes(app, skillRegistry);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/skills",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      {
        id: "word-docx",
        name: "Word / DOCX",
        description: "Handle DOCX files without formatting drift.",
        filePath: "C:/skills/word-docx/SKILL.md",
        source: "user",
        enabled: true,
      },
    ]);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/skills/word-docx",
      payload: { enabled: false },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual({
      id: "word-docx",
      name: "Word / DOCX",
      description: "Handle DOCX files without formatting drift.",
      filePath: "C:/skills/word-docx/SKILL.md",
      source: "user",
      enabled: false,
    });
    expect(skillRegistry.get("word-docx")?.enabled).toBe(false);

    await app.close();
  });

  it("returns 404 when toggling an unknown skill", async () => {
    const app = Fastify();
    registerSkillRoutes(app, new SkillRegistry());

    const response = await app.inject({
      method: "PATCH",
      url: "/api/skills/missing-skill",
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Skill not found" });

    await app.close();
  });
});
