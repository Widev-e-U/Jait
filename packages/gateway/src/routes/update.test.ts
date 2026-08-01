import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerUpdateRoutes } from "./update.js";

async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "jakob" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile update route", () => {
  it("returns the signed Android APK from a newer GitHub release", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [
        {
          name: "app-release-unsigned.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/app-release-unsigned.apk",
        },
        {
          name: "Jait-0.1.635-android.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-android.apk",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currentVersion: "0.1.634",
      latestVersion: "0.1.635",
      hasUpdate: true,
      downloadUrl: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-android.apk",
      assetName: "Jait-0.1.635-android.apk",
      wearDownloadUrl: null,
      wearAssetName: null,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    await app.close();
  });

  it("also returns the wear APK from the same release when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [
        {
          name: "Jait-0.1.635-android.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-android.apk",
        },
        {
          name: "Jait-0.1.635-wear.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-wear.apk",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      wearDownloadUrl: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-wear.apk",
      wearAssetName: "Jait-0.1.635-wear.apk",
    });

    await app.close();
  });

  it("reports no update when the installed APK matches the release", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.634",
      assets: [{
        name: "Jait-0.1.634-android.apk",
        browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.634/Jait-0.1.634-android.apk",
      }],
    }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().hasUpdate).toBe(false);

    await app.close();
  });

  it("does not offer an unsigned APK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [{
        name: "app-release-unsigned.apk",
        browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/app-release-unsigned.apk",
      }],
    }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      hasUpdate: false,
      downloadUrl: null,
      assetName: null,
    });

    await app.close();
  });

  it("does not claim an update when the app version is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [],
    }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check",
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentVersion: "",
      latestVersion: "0.1.635",
      hasUpdate: false,
      downloadUrl: null,
    });

    await app.close();
  });

  it("returns a gateway error when GitHub rejects the check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "Failed to check for updates",
      detail: "GitHub responded 403",
    });

    await app.close();
  });

  it("requires authentication before contacting GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { app } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
    });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    await app.close();
  });
});
