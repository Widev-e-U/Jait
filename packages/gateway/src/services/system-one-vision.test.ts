import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateDecision } from "./system-one.js";

afterEach(() => vi.unstubAllGlobals());
describe("System One image requests", () => {
  it("sends TypeSafe images using assets and the required experimental header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ model: "test", answers: { next: { type: "noul", noul: 1 } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const image = await sharp({ create: { width: 1265, height: 2393, channels: 3, background: "#fff" } }).png().toBuffer();
    await evaluateDecision({ SYSTEM_ONE_API_KEY: "vision-test-key" }, "page state", { next: { type: "noul", instructions: "Is it visible?" } }, undefined, image);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect((init.headers as Record<string, string>)["TypeSafe-Danger-Zone-Images"]).toBe("true");
    const asset = body.assets[body.state.screenshot];
    expect(asset.format).toBe("png");
    expect(await sharp(Buffer.from(asset.data_base64, "base64")).metadata()).toMatchObject({ width: 829, height: 1568 });
  });
  it("pads narrow images without cropping them", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ model: "test", answers: { next: { type: "noul", noul: 1 } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const image = await sharp({ create: { width: 100, height: 1000, channels: 3, background: "#fff" } }).png().toBuffer();
    await evaluateDecision({ SYSTEM_ONE_API_KEY: "vision-narrow-key" }, "narrow page", { next: { type: "noul", instructions: "Is it visible?" } }, undefined, image);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(await sharp(Buffer.from(body.assets[body.state.screenshot].data_base64, "base64")).metadata()).toMatchObject({ width: 280, height: 1000 });
  });
  it("rejects malformed images before making a provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(evaluateDecision({ SYSTEM_ONE_API_KEY: "vision-invalid-key" }, "page", { next: { type: "noul", instructions: "Visible?" } }, undefined, Buffer.from("bad"))).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
