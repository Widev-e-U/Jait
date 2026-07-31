import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { CalendarService } from "../services/calendar/index.js";

function redirectUri(request: FastifyRequest): string {
  const publicBase = process.env["JAIT_PUBLIC_URL"]?.trim().replace(/\/+$/, "");
  if (publicBase) return `${publicBase}/api/calendar/oauth/callback`;
  const protocol = (request.headers["x-forwarded-proto"] as string | undefined) ?? request.protocol;
  const host = (request.headers["x-forwarded-host"] as string | undefined) ?? request.headers.host;
  return `${protocol}://${host}/api/calendar/oauth/callback`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function callbackHtml(message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Calendar connection</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0f;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;max-width:380px;padding:24px}.icon{font-size:48px}.msg{margin-top:12px;color:${ok ? "#34d399" : "#f87171"}}</style></head>
<body><div class="card"><div class="icon">${ok ? "✅" : "⚠️"}</div><h2>${ok ? "Calendar connected" : "Connection failed"}</h2><p class="msg">${escapeHtml(message)}</p><p style="color:#9ca3af;font-size:13px">You can close this window.</p></div>
<script>try{window.opener&&window.opener.postMessage({type:'jait-calendar-oauth',ok:${ok}},'*')}catch(e){}setTimeout(function(){window.close()},${ok ? 1200 : 4000})</script></body></html>`;
}

export function registerCalendarRoutes(
  app: FastifyInstance,
  config: AppConfig,
  calendar: CalendarService,
): void {
  const auth = (request: FastifyRequest, reply: FastifyReply) => requireAuth(request, reply, config.jwtSecret);

  app.get("/api/calendar/config", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    return { providers: { google: calendar.isConfigured(user.id) } };
  });

  app.post("/api/calendar/config/google", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const body = (request.body ?? {}) as { clientId?: string; clientSecret?: string };
    if (!body.clientId?.trim() || !body.clientSecret?.trim()) {
      return reply.status(400).send({ error: "clientId and clientSecret are required" });
    }
    calendar.saveAppCredentials(user.id, {
      clientId: body.clientId.trim(),
      clientSecret: body.clientSecret.trim(),
    });
    return { ok: true };
  });

  app.get("/api/calendar/accounts", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    return { accounts: calendar.listAccounts(user.id) };
  });

  app.delete("/api/calendar/accounts/:id", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    if (!calendar.disconnect(user.id, id)) return reply.status(404).send({ error: "Account not found" });
    return { ok: true };
  });

  app.get("/api/calendar/connect/google", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    try {
      return calendar.startConnect({ userId: user.id, redirectUri: redirectUri(request) });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : "Failed to start connection" });
    }
  });

  app.get("/api/calendar/oauth/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
    reply.header("Content-Type", "text/html; charset=utf-8");
    if (query.error) return reply.send(callbackHtml(query.error_description ?? query.error, false));
    if (!query.code || !query.state) return reply.send(callbackHtml("Missing authorization code.", false));
    try {
      const account = await calendar.completeConnect({ code: query.code, state: query.state });
      return reply.send(callbackHtml(`Connected ${account.email}.`, true));
    } catch (error) {
      return reply.send(callbackHtml(error instanceof Error ? error.message : "Token exchange failed", false));
    }
  });

  app.get("/api/calendar/calendars", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const query = request.query as { accountId?: string };
    try {
      return await calendar.listCalendars(user.id, query.accountId);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : "Failed to list calendars" });
    }
  });

  app.get("/api/calendar/events", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const query = request.query as {
      accountId?: string;
      calendarId?: string;
      timeMin?: string;
      timeMax?: string;
      q?: string;
      limit?: string;
    };
    try {
      return await calendar.listEvents(user.id, query.accountId, {
        calendarId: query.calendarId,
        timeMin: query.timeMin,
        timeMax: query.timeMax,
        query: query.q,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
      });
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : "Failed to list events" });
    }
  });
}
