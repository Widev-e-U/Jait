import { describe, expect, it } from "vitest";
import { validateToolInput } from "./validate.js";

describe("validateToolInput", () => {
  it("coerces and validates nested array items", () => {
    const input: Record<string, unknown> = {
      todoList: [
        {
          id: "1",
          title: "Ship tests",
          status: "in-progress",
        },
      ],
    };

    const result = validateToolInput(
      {
        type: "object",
        properties: {
          todoList: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                title: { type: "string" },
                status: {
                  type: "string",
                  enum: ["not-started", "in-progress", "completed"],
                },
              },
              required: ["id", "title", "status"],
            },
          },
        },
        required: ["todoList"],
      },
      input,
    );

    expect(result).toEqual({ valid: true, errors: [] });
    expect(input).toEqual({
      todoList: [
        {
          id: 1,
          title: "Ship tests",
          status: "in-progress",
        },
      ],
    });
  });

  it("reports nested required properties with full paths", () => {
    const result = validateToolInput(
      {
        type: "object",
        properties: {
          threads: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                runtimeMode: {
                  type: "string",
                  enum: ["full-access", "supervised"],
                },
              },
              required: ["title"],
            },
          },
        },
      },
      {
        threads: [
          {
            runtimeMode: "full-access",
          },
        ],
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required property: threads[0].title");
  });

  it("rejects invalid nested array item types", () => {
    const result = validateToolInput(
      {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      {
        urls: ["https://example.com", 42],
      },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Property 'urls[1]' expected type 'string', got 'number'");
  });

  it("parses nested object JSON before validating children", () => {
    const input: Record<string, unknown> = {
      payload: "{\"enabled\":\"true\"}",
    };

    const result = validateToolInput(
      {
        type: "object",
        properties: {
          payload: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
            },
            required: ["enabled"],
          },
        },
      },
      input,
    );

    expect(result).toEqual({ valid: true, errors: [] });
    expect(input).toEqual({
      payload: {
        enabled: true,
      },
    });
  });
});
