import { createServer, type Server } from "node:http";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navigateHistory } from "./browser-cursor.cjs";

const pages: Record<string, string> = {
  "/a": `<title>A</title><a id="login" href="/redirect">login</a> <a id="spa" href="/spa">spa</a> <a id="b" href="/b">b</a>`,
  "/b": `<title>B</title><a id="anchor" href="#section">section</a><div style="height:3000px"></div><h2 id="section">Section</h2>`,
  // Client redirect without user input, like a sign-in hop.
  "/redirect": `<title>Redirecting</title><script>setTimeout(() => location.href = "/hop", 30)</script>`,
  "/hop": `<title>Hop</title><script>setTimeout(() => location.href = "/c", 30)</script>`,
  "/c": `<title>C</title>`,
  // Adds its own entry on load, as many single-page apps do.
  "/spa": `<title>SPA</title><script>history.pushState({}, "", "/spa#home")</script>`,
};

describe.skipIf(process.env["JAIT_BROWSER_INTEGRATION"] !== "1")("browser history buttons", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      response.end(pages[request.url ?? ""] ?? "<title>404</title>");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  const withPage = async (run: (page: import("playwright").Page) => Promise<void>) => {
    const browser = await chromium.launch({ headless: true });
    try { await run(await browser.newPage()); } finally { await browser.close(); }
  };

  it("goes back past a redirect chain instead of bouncing forward again", () => withPage(async page => {
    await page.goto(`${base}/a`);
    await page.click("#login");
    await page.waitForURL("**/c");
    await navigateHistory(page, "back");
    expect(page.url()).toBe(`${base}/a`);
  }));

  it("skips entries a page pushed for itself without user input", () => withPage(async page => {
    await page.goto(`${base}/a`);
    await page.click("#spa");
    await page.waitForURL("**/spa#home");
    await navigateHistory(page, "back");
    expect(page.url()).toBe(`${base}/a`);
  }));

  it("keeps ordinary back, forward and in-page anchors", () => withPage(async page => {
    await page.goto(`${base}/a`);
    await page.click("#b");
    await page.waitForURL("**/b");
    await page.click("#anchor");
    await navigateHistory(page, "back");
    expect(page.url()).toBe(`${base}/b`);
    await expect(page.evaluate(() => scrollY)).resolves.toBe(0);
    await navigateHistory(page, "back");
    expect(page.url()).toBe(`${base}/a`);
    await expect(page.title()).resolves.toBe("A");
    await navigateHistory(page, "forward");
    expect(page.url()).toBe(`${base}/b`);
    await expect(page.title()).resolves.toBe("B");
  }));

  it("does not go back to the blank start tab", () => withPage(async page => {
    await page.goto(`${base}/a`);
    await navigateHistory(page, "back");
    expect(page.url()).toBe(`${base}/a`);
  }));
});
