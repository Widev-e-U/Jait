import { describe, it, expect } from "vitest";
import { JAIT_PAGE_IDS, JAIT_PAGES, getToolPageId, type JaitPageContract } from "./capability-catalog.js";
import { safeNotificationLink } from "./notifications.js";

describe("required product page contract", () => {
  it("has unique internal destinations and explained capabilities for every page", () => {
    const paths = new Set<string>();
    for (const id of JAIT_PAGE_IDS) {
      const page: JaitPageContract = JAIT_PAGES[id];
      expect(page.description.length).toBeGreaterThan(20);
      expect(page.examples.length).toBeGreaterThan(0);
      expect(page.features.length).toBeGreaterThan(0);
      expect(paths.has(page.path)).toBe(false);
      paths.add(page.path);
      expect(safeNotificationLink(page.path)).toBe(page.path);
      for (const feature of page.features) {
        expect(feature.description.length).toBeGreaterThan(10);
        if (!feature.toolRefs.length) expect(feature.uiOnlyReason?.length).toBeGreaterThan(10);
      }
    }
  });
  it("distinguishes saved people from execution and maps shared references to their primary pages", () => {
    expect(getToolPageId("agent.profiles")).toBe("agents");
    expect(getToolPageId("agent.profiles.inspect")).toBe("agents");
    expect(getToolPageId("agent.spawn")).toBe("threads");
    expect(getToolPageId("thread.control")).toBe("threads");
    expect(getToolPageId("cron.add")).toBe("jobs");
    expect(getToolPageId("security.results.show")).toBe("network");
    expect(getToolPageId("new.adapter", "external")).toBe("settings");
  });
});
