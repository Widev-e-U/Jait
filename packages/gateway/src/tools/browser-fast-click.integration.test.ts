import { createServer, type ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserSurface } from "../surfaces/browser.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { createBrowserInteractionTools } from "./browser-tools.js";
import type { ToolDefinition } from "./contracts.js";
import { ToolRegistry } from "./registry.js";
import { ConsentAwareExecutor } from "../security/consent-executor.js";
import { ConsentManager } from "../security/consent-manager.js";
import { TrustEngine } from "../security/trust-engine.js";
import type { ToolPermission } from "../security/tool-permissions.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { BrowserWorkflowService } from "../services/browser-workflows.js";

describe.skipIf(process.env["JAIT_BROWSER_INTEGRATION"] !== "1").each(["in-process", "node-bridge"])(
  "System One click with real Chromium (%s)", runtime => {
    let server: ReturnType<typeof createServer>;
    let base: string;
    let surface: BrowserSurface;
    let tool: ToolDefinition;
    let hold: ((response: ServerResponse) => void) | undefined;
    let mouseMoved: (() => void) | undefined;
    const requests: string[] = [];
    const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
    function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
    beforeAll(async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    }, 30_000);
    beforeEach(async () => { await surface.navigate(`${base}/page`); });
    afterEach(() => { hold = undefined; mouseMoved = undefined; });
    afterAll(async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    });

    it("selects and clicks a real control in one tool call", async () => {
      const result = await tool.execute({ target: "Click Save" }, context);
      expect(result).toMatchObject({ ok: true, data: { actionResult: { selector: "#save", resolvedBy: "system-one" }, textPreview: expect.stringContaining("Saved") } });
      expect(requests.at(-1)).toContain("Save");
      expect(requests.at(-1)).not.toContain("Private text");
      expect(requests.at(-1)).not.toContain(base);
    });

    it("finds targets beyond the normal snapshot limit and rejects duplicates", async () => {
      await surface.navigate(`${base}/large`);
      expect(await tool.execute({ target: "Click Save" }, context)).toMatchObject({ ok: true });
      expect((await surface.inspect()).snapshot.text).toContain("Saved");
      await surface.navigate(`${base}/duplicate`);
      const count = requests.length;
      await expect(tool.execute({ target: "Click Save" }, context)).rejects.toThrow(/ambiguous/i);
      expect(requests).toHaveLength(count);
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });

    it("guards field actions against reload and accepts an unchanged target", async () => {
      const snapshot = (await surface.inspect()).snapshot;
      const guardFor = (id: string) => {
        const element = snapshot.elements.find(item => item.id === id)!;
        return { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: element.tagName!, name: element.name ?? "", text: element.text ?? "" };
      };
      await surface.typeText("#field", "hello", undefined, guardFor("field"));
      await surface.select("#choice", "b", undefined, guardFor("choice"));
      await surface.navigate(`${base}/page`);
      await expect(surface.typeText("#field", "stale", undefined, guardFor("field"))).rejects.toThrow(/changed/i);
      await expect(surface.select("#choice", "b", undefined, guardFor("choice"))).rejects.toThrow(/changed/i);
    });

    it("uses actionable textarea selectors for guarded typing", async () => {
      await surface.navigate(`${base}/textarea`);
      const snapshot = (await surface.inspect()).snapshot;
      const address = snapshot.elements.find(item => item.id === "currentAddress")!;
      const other = snapshot.elements.find(item => item.placeholder === "Other Address")!;
      expect(address.role).toBe("textbox");
      for (const element of [address, other]) {
        expect(element.selector).toBeTruthy();
        const guard = { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: element.tagName!, name: element.name ?? "", text: element.text ?? "" };
        await surface.typeText(element.selector!, "Address entered", undefined, guard);
      }
      expect((await surface.inspect()).snapshot.text).toContain("Address entered");
    });

    it("rejects a changed option and an input changed to password", async () => {
      const snapshot = (await surface.inspect()).snapshot;
      const field = snapshot.elements.find(item => item.id === "field")!;
      const choice = snapshot.elements.find(item => item.id === "choice")!;
      const guard = (item: typeof field) => ({ documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: item.tagName!, name: item.name ?? "", text: item.text ?? "" });
      await surface.click("#mutate");
      await expect(surface.typeText("#field", "hello", undefined, { ...guard(field), inputType: "text" })).rejects.toThrow(/changed/i);
      await expect(surface.select("#choice", "b", undefined, { ...guard(choice), option: { value: "b", label: "B" } })).rejects.toThrow(/changed/i);
    });

    it("rejects a guarded selector after same-URL reload", async () => {
      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "save")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "" });
      await surface.navigate(`${base}/page`);
      await expect(tool.execute({ selector: "#save", expected }, context)).rejects.toThrow(/changed/i);
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });

    it("reports a pre-dispatch stale target to the adaptive task", async () => {
      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "save")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "" });
      await surface.navigate(`${base}/page`);
      expect(await tool.execute({ selector: "#save", expected }, { ...context, browserTaskRecoverStale: true })).toMatchObject({ ok: false, data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } });
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });

    it("reports a stale field before any text input to the adaptive task", async () => {
      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "field")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "", inputType: "text" });
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      const type = createBrowserInteractionTools(registry).find(item => item.name === "browser.type")!;
      await surface.navigate(`${base}/page`);
      expect(await type.execute({ selector: "#field", text: "hello", expected }, { ...context, browserTaskRecoverStale: true })).toMatchObject({ ok: false, data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } });
    });

    it("rejects a navigation while the model is choosing", async () => {
      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const pending = tool.execute({ target: "Press Save" }, context);
      const response = await modelRequest;
      await surface.navigate(`${base}/different`);
      answer(response);
      await expect(pending).rejects.toThrow(/changed/i);
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });

    it("rejects a reload at the same URL while the model is choosing", async () => {
      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const pending = tool.execute({ target: "Activate Save" }, context);
      const response = await modelRequest;
      await surface.navigate(`${base}/page`);
      answer(response);
      await expect(pending).rejects.toThrow(/changed/i);
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });

    it("cancels an in-flight guarded click before dispatch", async () => {
      await surface.navigate(`${base}/block`);
      const snapshot = (await surface.inspect()).snapshot;
      const moved = new Promise<void>(resolve => { mouseMoved = resolve; });
      const controller = new AbortController();
      const pending = surface.click("#save", controller.signal, { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: "button", name: "Save", text: "Save" })
        .then(() => "clicked", () => "cancelled");
      await Promise.race([moved, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Mouse did not move")), 3000))]);
      controller.abort();
      expect(await pending).toBe("cancelled");
      await new Promise(resolve => setTimeout(resolve, 750));
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });

    it("runs a descriptive workflow click through its own consent check", async () => {
      const tools = new ToolRegistry();
      tools.register(tool);
      tools.register({
        name: "browser.open", tier: "standard", category: "browser", source: "builtin",
        description: "Open the fixture", parameters: { type: "object", properties: { url: { type: "string" } } },
        execute: async (input: unknown) => {
          await surface.navigate((input as { url: string }).url);
          return { ok: true, message: "opened" };
        },
      });
      const consent = new ConsentManager({ defaultTimeoutMs: 5000 });
      const permissions = new Map<string, ToolPermission>([
        ["browser.open", { toolName: "browser.open", consentLevel: "none", risk: "low", description: "Open" }],
        ["browser.click", { toolName: "browser.click", consentLevel: "always", risk: "low", description: "Click" }],
      ]);
      const executor = new ConsentAwareExecutor({ toolRegistry: tools, consentManager: consent, trustEngine: new TrustEngine(), permissions, sessionApprovals: new Set() });
      const { db, sqlite } = await openDatabase(":memory:");
      migrateDatabase(sqlite);
      const workflows = new BrowserWorkflowService(db, (name, input, ctx) => executor.execute(name, input, ctx));
      try {
        const workflow = workflows.save({ formatVersion: 1, name: "Fixture", description: "", inputs: [], steps: [
          { action: "open", label: "Open", url: `${base}/page` },
          { action: "click", label: "Save", target: "Activate Save for workflow integration" },
        ] }, context);
        const requestCount = requests.length;
        const pending = workflows.run(workflow.id, {}, context, workflow.revision);
        await expect.poll(() => consent.pendingCount).toBe(1);
        expect(requests).toHaveLength(requestCount);
        expect((await surface.inspect()).snapshot.text).toContain("Ready");
        consent.approve(consent.listPending()[0]!.id);
        expect(await pending).toMatchObject({ ok: true, data: { status: "succeeded", nextStep: 2 } });
        expect((await surface.inspect()).snapshot.text).toContain("Saved");
      } finally {
        workflows.stop();
        sqlite.close();
      }
    }, 15000);

    it("cancels inference without clicking", async () => {
      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const controller = new AbortController();
      const pending = tool.execute({ target: "Choose Save" }, { ...context, signal: controller.signal });
      const response = await modelRequest;
      controller.abort();
      answer(response);
      await expect(pending).rejects.toThrow();
      expect((await surface.inspect()).snapshot.text).toContain("Ready");
    });
  },
);
