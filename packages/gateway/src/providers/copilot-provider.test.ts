import { describe, expect, it } from "vitest";
import { buildCopilotExitError, parseCopilotModelsFromHelp } from "./copilot-provider.js";

describe("buildCopilotExitError", () => {
  it("includes stderr details when Copilot exits non-zero", () => {
    expect(buildCopilotExitError(1, null, 'Error: Model "gpt-5.4-mini" from --model flag is not available.'))
      .toBe('Copilot CLI exited with code 1: Error: Model "gpt-5.4-mini" from --model flag is not available.');
  });

  it("falls back to the exit code when stderr is empty", () => {
    expect(buildCopilotExitError(1, null, "   ")).toBe("Copilot CLI exited with code 1");
  });
});

describe("parseCopilotModelsFromHelp", () => {
  it("extracts only --model choices and ignores --output-format choices", () => {
    const output = `Usage: copilot [options] [command]

Options:
  --model <model>                     Set the AI model to use (choices:
                                      "claude-haiku-4.5", "gpt-4.1",
                                      "gpt-5.4-mini")
  --output-format <format>            Output format: 'text' (default) or 'json'
                                      (choices: "text", "json")
`;

    expect(parseCopilotModelsFromHelp(output).map((m) => m.id)).toEqual([
      "claude-haiku-4.5",
      "gpt-4.1",
      "gpt-5.4-mini",
    ]);
  });

  it("returns an empty array when no model block exists", () => {
    expect(parseCopilotModelsFromHelp('  --output-format <format> (choices: "text", "json")')).toEqual([]);
  });
});
