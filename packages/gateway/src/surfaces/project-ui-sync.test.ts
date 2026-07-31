import { describe, expect, it } from "vitest";
import { FileSystemSurface } from "./filesystem.js";
import { shouldSyncProjectSurfaceUi } from "./project-ui-sync.js";

describe("shouldSyncProjectSurfaceUi", () => {
  it("keeps an implicitly created file-tool surface out of the project UI", async () => {
    const surface = new FileSystemSurface("fs-session-1");
    await surface.start({ sessionId: "session-1", projectRoot: process.cwd() });

    expect(shouldSyncProjectSurfaceUi(surface)).toBe(false);
  });

  it.each([true, false])("syncs an explicitly opened project with panelOpen=%s", async (panelOpen) => {
    const surface = new FileSystemSurface(`fs-explicit-${panelOpen}`);
    await surface.start({ sessionId: "session-1", projectRoot: process.cwd(), panelOpen });

    expect(shouldSyncProjectSurfaceUi(surface)).toBe(true);
  });
});
