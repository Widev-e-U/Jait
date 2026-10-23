import { describe, expect, it } from "vitest";
import { ChatLoopSchema, readChatLoop } from "./chat-loop.js";

const loop = {
  id: "loop-1",
  goal: "Finish the task",
  criteria: ["criterion"],
  status: "running",
  iteration: 0,
  revision: 0,
  checkedIteration: -1,
  summary: "",
  nextMessage: "",
  evidence: [],
  updatedAt: new Date().toISOString(),
};

describe("readChatLoop", () => {
  it("reads a loop from object metadata", () => {
    expect(readChatLoop({ loop })).toEqual(loop);
  });

  it("reads a loop from JSON string metadata", () => {
    expect(readChatLoop(JSON.stringify({ loop }))).toEqual(loop);
  });

  it("returns null when no loop is present", () => {
    expect(readChatLoop({})).toBeNull();
    expect(readChatLoop("{}")).toBeNull();
  });

  it("returns null for a loop that fails schema validation", () => {
    expect(readChatLoop({ loop: { id: "x" } })).toBeNull();
  });

  it("returns null for unparseable string metadata", () => {
    expect(readChatLoop("not json")).toBeNull();
  });

  it("returns null for non-object metadata", () => {
    expect(readChatLoop(42)).toBeNull();
  });

  it("accepts a full valid loop through the schema", () => {
    expect(ChatLoopSchema.safeParse(loop).success).toBe(true);
  });
});
