import { test, expect } from "@playwright/test";

const API_URL = process.env.API_URL || "http://localhost:8000";

async function registerAndLogin(request: any) {
  const username = `e2e-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const password = "supersecret123";

  const register = await request.post(`${API_URL}/auth/register`, {
    data: { username, password },
  });
  expect(register.ok()).toBeTruthy();
  const payload = await register.json();
  return payload.access_token as string;
}

test.describe("Chat streaming auth flow", () => {
  test("requires auth and supports authenticated stream resume for a user session", async ({ request }) => {
    // Guard 1: chat endpoint is protected
    const unauthChat = await request.post(`${API_URL}/api/chat`, {
      data: { content: "hello", sessionId: `chat-unauth-${Date.now()}` },
    });
    expect(unauthChat.status()).toBe(401);

    const token = await registerAndLogin(request);
    const headers = { Authorization: `Bearer ${token}` };

    // Create a real user-owned session, then stream-resume that session.
    const created = await request.post(`${API_URL}/api/sessions`, {
      headers,
      data: { name: "auth-stream-e2e" },
    });
    expect(created.ok()).toBeTruthy();
    const session = await created.json();
    const sessionId = session.id as string;
    expect(sessionId).toBeTruthy();

    // Guard 2: stream endpoint is protected
    const unauthStream = await request.get(`${API_URL}/api/sessions/${sessionId}/stream`);
    expect(unauthStream.status()).toBe(401);

    const stream = await request.get(`${API_URL}/api/sessions/${sessionId}/stream`, { headers });
    expect(stream.ok()).toBeTruthy();
    const body = await stream.text();

    const events = body
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);

    expect(events[0]?.type).toBe("snapshot");
    expect(events[0]?.streaming).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
    expect(events.at(-1)?.session_id).toBe(sessionId);
  });
});
