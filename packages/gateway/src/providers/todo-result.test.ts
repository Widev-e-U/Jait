import { describe, expect, it } from "vitest";
import { extractTodoResultItems } from "./todo-result.js";

describe("extractTodoResultItems", () => {
  it("extracts todo items from canonical todo results", () => {
    expect(extractTodoResultItems("todo", {
      items: [
        { id: 1, title: "Trace bug", status: "in-progress" },
        { id: 2, title: "Patch bug", status: "not-started" },
      ],
    })).toEqual([
      { id: 1, title: "Trace bug", status: "in-progress" },
      { id: 2, title: "Patch bug", status: "not-started" },
    ]);
  });

  it("extracts todo items from codex-style non-todo tool names when data includes items", () => {
    expect(extractTodoResultItems("mcp-tool", {
      items: [
        { id: 1, title: "Trace bug", status: "in-progress" },
      ],
    })).toEqual([
      { id: 1, title: "Trace bug", status: "in-progress" },
    ]);
  });

  it("normalizes claude TodoWrite args", () => {
    expect(extractTodoResultItems("todo", null, {
      todos: [
        { id: 1, content: "Trace bug", status: "in_progress" },
        { id: 2, content: "Patch bug", status: "completed" },
      ],
    })).toEqual([
      { id: 1, title: "Trace bug", status: "in-progress" },
      { id: 2, title: "Patch bug", status: "completed" },
    ]);
  });
});
