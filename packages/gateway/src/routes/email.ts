import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { EmailService, EmailProvider } from "../services/email/index.js";

const PROVIDERS = new Set<EmailProvider>(["gmail", "outlook"]);

function isProvider(value: string): value is EmailProvider {
  return PROVIDERS.has(value as EmailProvider);
}

/** Derive the OAuth redirect URI for this gateway from the request / env. */
function redirectUri(request: FastifyRequest): string {
  const envBase = process.env["JAIT_PUBLIC_URL"]?.trim().replace(/\/+$/, "");
  if (envBase) return `${envBase}/api/email/oauth/callback`;
  const proto = (request.headers["x-forwarded-proto"] as string | undefined) ?? request.protocol;
  const host = (request.headers["x-forwarded-host"] as string | undefined) ?? request.headers.host;
  return `${proto}://${host}/api/email/oauth/callback`;
}

function callbackHtml(message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Email connection</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b0f;color:#e5e7eb;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center;max-width:360px;padding:24px}
.icon{font-size:48px}.msg{margin-top:12px;color:${ok ? "#34d399" : "#f87171"}}</style></head>
<body><div class="card"><div class="icon">${ok ? "✅" : "⚠️"}</div>
<h2>${ok ? "Mailbox connected" : "Connection failed"}</h2>
<p class="msg">${message.replace(/</g, "&lt;")}</p>
<p style="color:#9ca3af;font-size:13px">You can close this window.</p></div>
<script>try{window.opener&&window.opener.postMessage({type:'jait-email-oauth',ok:${ok}},'*')}catch(e){}
setTimeout(function(){window.close()},${ok ? 1200 : 4000})</script></body></html>`;
}

export function registerEmailRoutes(
  app: FastifyInstance,
  config: AppConfig,
  email: EmailService,
): void {
  const auth = (request: FastifyRequest, reply: FastifyReply) => requireAuth(request, reply, config.jwtSecret);

  // Which providers are ready to connect.
  app.get("/api/email/config", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    return { providers: email.configuredProviders(user.id) };
  });

  // Save OAuth app credentials for a provider (so the user can configure from UI).
  app.post("/api/email/config/:provider", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { provider } = request.params as { provider: string };
    if (!isProvider(provider)) return reply.status(400).send({ error: "Unknown provider" });
    const body = (request.body ?? {}) as { clientId?: string; clientSecret?: string };
    if (!body.clientId || !body.clientSecret) {
      return reply.status(400).send({ error: "clientId and clientSecret are required" });
    }
    email.saveAppCredentials(user.id, provider, { clientId: body.clientId.trim(), clientSecret: body.clientSecret.trim() });
    return { ok: true };
  });

  // List connected accounts.
  app.get("/api/email/accounts", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    return { accounts: email.listAccounts(user.id) };
  });

  // Disconnect an account.
  app.delete("/api/email/accounts/:id", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const ok = email.disconnect(user.id, id);
    if (!ok) return reply.status(404).send({ error: "Account not found" });
    return { ok: true };
  });

  // Begin the OAuth connect flow — returns an authorize URL to open.
  app.get("/api/email/connect/:provider", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { provider } = request.params as { provider: string };
    if (!isProvider(provider)) return reply.status(400).send({ error: "Unknown provider" });
    try {
      const { authUrl } = email.startConnect({ userId: user.id, provider, redirectUri: redirectUri(request) });
      return { authUrl };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to start connect" });
    }
  });

  // OAuth redirect target — unauthenticated; trust is via the signed `state`.
  app.get("/api/email/oauth/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
    reply.header("Content-Type", "text/html; charset=utf-8");
    if (query.error) return reply.send(callbackHtml(query.error_description ?? query.error, false));
    if (!query.code || !query.state) return reply.send(callbackHtml("Missing authorization code.", false));
    try {
      const account = await email.completeConnect({ code: query.code, state: query.state });
      return reply.send(callbackHtml(`Connected ${account.email}.`, true));
    } catch (err) {
      return reply.send(callbackHtml(err instanceof Error ? err.message : "Token exchange failed", false));
    }
  });

  // List messages.
  app.get("/api/email/messages", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const q = request.query as { accountId?: string; folder?: string; q?: string; limit?: string };
    try {
      const result = await email.listMessages(user.id, q.accountId, {
        folder: q.folder,
        query: q.q,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
      });
      return result;
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to list messages" });
    }
  });

  // Read a single message.
  app.get("/api/email/messages/:id", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const q = request.query as { accountId?: string };
    try {
      return { message: await email.getMessage(user.id, q.accountId, id) };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to read message" });
    }
  });

  // Send (or reply to) a message.
  app.post("/api/email/send", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const body = (request.body ?? {}) as {
      accountId?: string;
      to?: string;
      subject?: string;
      body?: string;
      cc?: string;
      bcc?: string;
      replyToMessageId?: string;
      html?: boolean;
    };
    if (!body.to && !body.replyToMessageId) return reply.status(400).send({ error: "A recipient is required" });
    try {
      const sent = await email.sendMessage(user.id, body.accountId, {
        to: body.to ?? "",
        subject: body.subject ?? "",
        body: body.body ?? "",
        cc: body.cc,
        bcc: body.bcc,
        replyToMessageId: body.replyToMessageId,
        html: body.html,
      });
      return { ok: true, id: sent.id };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to send" });
    }
  });

  // Tag / untag (Gmail label or Outlook category).
  app.post("/api/email/messages/:id/tag", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { accountId?: string; add?: string[]; remove?: string[] };
    try {
      await email.tagMessage(user.id, body.accountId, id, body.add ?? [], body.remove ?? []);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to tag" });
    }
  });

  // Move a message to trash / deleted items.
  app.post("/api/email/messages/:id/delete", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { accountId?: string };
    try {
      await email.deleteMessage(user.id, body.accountId, id);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to delete" });
    }
  });

  // List folders / labels.
  app.get("/api/email/folders", async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const q = request.query as { accountId?: string };
    try {
      return { folders: await email.listFolders(user.id, q.accountId) };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Failed to list folders" });
    }
  });
}
