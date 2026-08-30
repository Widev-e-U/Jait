import { describe, expect, it } from "vitest";
import { getTerminalOutputSlice } from "./terminal-output.js";

// What a shell with OSC 633 integration emits when the next prompt redraw is
// bundled into the same PTY read as the previous command's done marker.
const NEXT_PROMPT_WITH_DONE_MARKER =
  "\x1b]633;D;0\x07\x1b]633;A\x07\x1b]633;B\x07user@host:~/repo$ \x1b]633;C\x07";

describe("getTerminalOutputSlice", () => {
  it("cuts a bundled done marker and next prompt out of a command slice", () => {
    const buffer = ["older\r\n", "$ echo hi\r\nhi\r\n", NEXT_PROMPT_WITH_DONE_MARKER];

    const slice = getTerminalOutputSlice(buffer, 3, 1, 3, 100, true);

    expect(slice).toBe("$ echo hi\r\nhi\r\n");
    expect(slice).not.toContain("user@host");
  });

  it("keeps the prompt before the command when no marker arrives", () => {
    const buffer = ["user@host:~/repo$ ", "ls\r\n"];

    const slice = getTerminalOutputSlice(buffer, 2, 0, 2, 100, true);

    expect(slice).toBe("user@host:~/repo$ ls\r\n");
  });

  it("keeps markers for the live tail when trimming is not requested", () => {
    const buffer = ["hi\r\n", NEXT_PROMPT_WITH_DONE_MARKER];

    const slice = getTerminalOutputSlice(buffer, 2, 0, 2, 100, false);

    expect(slice).toContain("hi\r\n");
    expect(slice).toContain("633;D");
  });

  it("replays the full head of a bounded command slice past the recent-lines cap", () => {
    // 150 one-line chunks: the toolcard's command-local replay must include the
    // *first* lines, not just the last 100 chunks the live tail view keeps.
    const buffer = Array.from({ length: 150 }, (_, i) => `line ${i}\r\n`);

    const slice = getTerminalOutputSlice(buffer, 150, 0, 150, 100, false);

    expect(slice.startsWith("line 0\r\n")).toBe(true);
    expect(slice).toContain("line 149\r\n");
  });

  it("still caps the unbounded live tail at the recent-lines limit", () => {
    const buffer = Array.from({ length: 150 }, (_, i) => `line ${i}\r\n`);

    const slice = getTerminalOutputSlice(buffer, 150, 0, undefined, 100, false);

    expect(slice.startsWith("line 50\r\n")).toBe(true);
    expect(slice).not.toContain("line 49\r\n");
  });
});