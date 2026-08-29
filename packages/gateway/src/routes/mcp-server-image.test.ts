import { describe, expect, it } from "vitest";
import { mcpContentForToolResult } from "./mcp-server.js";

describe("mcpContentForToolResult", () => {
  it("emits screenshots as MCP image content without duplicating base64 in text", () => {
    const content = mcpContentForToolResult({
      ok: true,
      message: "Desktop captured.",
      data: {
        action: "type",
        screenshot: {
          pngBase64: "cG5nLWJ5dGVz",
          width: 1920,
          height: 1080,
          originX: 0,
          originY: 0,
        },
      },
    });

    expect(content).toEqual([
      {
        type: "text",
        text: 'Desktop captured.\n{"action":"type","screenshot":{"width":1920,"height":1080,"originX":0,"originY":0}}',
      },
      { type: "image", data: "cG5nLWJ5dGVz", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(content[0])).not.toContain("cG5nLWJ5dGVz");
  });
});
