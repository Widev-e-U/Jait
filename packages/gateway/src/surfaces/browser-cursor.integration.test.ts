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

  it("clicks only the unique unchanged control on the original document", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<button id="save" onclick="this.textContent=\'Saved\'">Save</button>');
      const guard = { documentUrl: page.url(), documentTimeOrigin: await page.evaluate(() => performance.timeOrigin), tagName: "button", name: "Save", text: "Save" };
      await clickWithVisibleCursor(page as unknown as CursorPage, "#save", undefined, guard);
      expect(await page.locator("#save").textContent()).toBe("Saved");
      await expect(clickWithVisibleCursor(page as unknown as CursorPage, "#save", undefined, guard)).rejects.toThrow("GUARDED_CLICK_IDENTITY_MISMATCH");
      expect(await page.locator("#save").textContent()).toBe("Saved");
      await page.setContent('<button id="save">Save</button><button id="save">Save</button>');
      await expect(clickWithVisibleCursor(page as unknown as CursorPage, "#save", undefined, guard)).rejects.toThrow("GUARDED_CLICK_TARGET_COUNT");
      await page.setContent('<button id="save">Save</button>');
      await expect(clickWithVisibleCursor(page as unknown as CursorPage, "#save", undefined, { ...guard, documentUrl: "https://other.test/" })).rejects.toThrow("GUARDED_CLICK_IDENTITY_MISMATCH");
    } finally {
      await browser.close();
    }
  });

  it("stops before the click if the control changes or the action is cancelled while moving", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<button id="save" onclick="window.clicked=true">Save</button>');
      const guard = { documentUrl: page.url(), documentTimeOrigin: await page.evaluate(() => performance.timeOrigin), tagName: "button", name: "Save", text: "Save" };
      const agentPage: CursorPage = {
        locator: selector => page.locator(selector),
        evaluate: (fn, ...args) => page.evaluate(fn, args[0]),
        click: selector => page.click(selector),
        mouse: { move: async (x, y) => {
          await page.mouse.move(x, y);
          await page.locator("#save").evaluate(el => { el.textContent = "Delete"; });
        } },
      };
      await expect(clickWithVisibleCursor(agentPage, "#save", undefined, guard)).rejects.toThrow("GUARDED_CLICK_IDENTITY_MISMATCH");
      expect(await page.evaluate(() => (window as unknown as { clicked?: boolean }).clicked)).toBeUndefined();
      await page.locator("#save").evaluate(el => { el.textContent = "Save"; });
      const controller = new AbortController();
      agentPage.mouse!.move = async () => { controller.abort(); };
      await expect(clickWithVisibleCursor(agentPage, "#save", controller.signal, guard)).rejects.toThrow("Cancelled");
      expect(await page.evaluate(() => (window as unknown as { clicked?: boolean }).clicked)).toBeUndefined();
    } finally {
      await browser.close();
    }
  });

});
