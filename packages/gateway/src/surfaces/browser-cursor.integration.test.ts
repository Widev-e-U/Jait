import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { clickWithVisibleCursor, type CursorPage } from "./browser-cursor.cjs";

describe.skipIf(process.env["JAIT_BROWSER_INTEGRATION"] !== "1")("agent browser cursor", () => {
  it("ignores user pointer movement during and after an agent click", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
      await page.setContent('<button id="target" style="position:absolute;left:300px;top:200px;width:100px;height:40px" onclick="this.textContent=\'clicked\'">click</button>');
      const agentPage: CursorPage = {
        locator: selector => page.locator(selector),
        evaluate: (fn, ...args) => page.evaluate(fn, args[0]),
        click: selector => page.click(selector),
        mouse: { move: async (x, y) => {
          await page.mouse.move(x, y);
          await page.mouse.move(20, 30);
        } },
      };
      await clickWithVisibleCursor(agentPage, "#target");
      const cursor = page.locator("#__jait_agent_cursor__");
      await expect(cursor.evaluate(element => (element as HTMLElement).style.transform)).resolves.toBe("translate(350px, 220px)");
      await page.mouse.move(80, 90);
      await expect(cursor.evaluate(element => (element as HTMLElement).style.transform)).resolves.toBe("translate(350px, 220px)");
      expect(await page.locator("#target").textContent()).toBe("clicked");
    } finally {
      await browser.close();
    }
  });
});
