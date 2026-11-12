import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { requireAuth } from '../security/http-auth.js';
import {
  MessengerService,
  messengerHomeserver,
  type IncomingMessengerHandler,
} from '../services/messenger-service.js';
import type { MessengerBridge } from '../services/messenger-bridge.js';
import { bridgeStatuses } from '../services/bridge-status.js';
import type { TeamsReauthService } from '../services/bridge-reauth.js';

const roomId = z.string().min(3).max(512).startsWith('!');
const login = z
  .object({
    homeserver: z
      .string()
      .max(2048)
      .transform((v, ctx) => {
        try {
          return messengerHomeserver(v);
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Invalid Matrix homeserver URL.',
          });
          return z.NEVER;
        }
      }),
    username: z.string().max(512).default(''),
    password: z.string().max(4096).default(''),
    accessToken: z.string().min(1).max(4096).optional(),
  })
  .strict()
  .refine((v) => v.accessToken || (v.username && v.password));
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), roomId, eventId: z.string().min(1).max(512), text: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ action: z.literal('react'), roomId, eventId: z.string().min(1).max(512), key: z.string().trim().min(1).max(64) }).strict(),
  z
    .object({ action: z.literal('assistantAccess'), enabled: z.boolean() })
    .strict(),
  z
    .object({
      action: z.literal('send'),
      roomId,
      text: z.string().trim().min(1).max(10000),
      replyToEventId: z.string().min(1).max(512).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('open'),
      userId: z
        .string()
        .max(512)
        .regex(/^@[^:\s]+:[^\s]+$/),
    })
    .strict(),
  ...(['join', 'leave', 'earlier', 'unread', 'remove', 'hide', 'unhide'] as const).map((action) =>
    z.object({ action: z.literal(action), roomId }).strict(),
  ),
  z
    .object({
      action: z.literal('read'),
      roomId,
      eventId: z.string().min(1).max(512).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('attachment'),
      roomId,
      name: z.string().min(1).max(512),
      mime: z.string().max(200),
      data: z
        .string()
        .max(28_000_000)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    })
    .strict(),
]);

export function registerMessengerRoutes(
  app: FastifyInstance,
  config: AppConfig,
  bridge?: MessengerBridge,
  teamsReauth?: TeamsReauthService,
  onIncoming?: IncomingMessengerHandler,
) {
  const messenger = new MessengerService(config.jwtSecret);
  messenger.onIncoming(onIncoming);
  const auth = (request: FastifyRequest, reply: FastifyReply) =>
    requireAuth(request, reply, config.jwtSecret);
  bridge?.setGatewayHandler((owner, cmd, signal) =>
    messenger.assistant(owner, cmd, signal),
  );
  messenger.restore();
  app.addHook('onClose', async () => {
    bridge?.setGatewayHandler(undefined);
    await messenger.stop();
  });
  app.get('/api/messenger/bridge-status', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const query = request.query as { refresh?: string };
    const force = query.refresh === '1' || query.refresh === 'true';
    return { bridges: await bridgeStatuses(force) };
  });
  app.post('/api/messenger/bridge-status', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    return { bridges: await bridgeStatuses(true) };
  });
  app.get('/api/messenger/presence', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    return messenger.ownPresence(user.id);
  });
  app.put('/api/messenger/presence', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const parsed = z
      .object({
        state: z.enum(['online', 'unavailable', 'offline']),
        keep: z.boolean().default(false),
      })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid presence.' });
    try {
      await messenger.setOwnPresence(user.id, parsed.data.state, parsed.data.keep);
      return messenger.ownPresence(user.id);
    } catch {
      return reply.code(400).send({ error: 'Could not update presence. Connect Matrix first.' });
    }
  });
  app.get('/api/messenger/bridge-reauth/teams', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    if (!teamsReauth) return reply.status(404).send({ error: 'Teams re-authentication is unavailable.' });
    return teamsReauth.get(user.id);
  });
  app.post('/api/messenger/bridge-reauth/teams', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    if (!teamsReauth) return reply.status(404).send({ error: 'Teams re-authentication is unavailable.' });
    const parsed = z.object({ accountId: z.string().regex(/^8:orgid:[0-9a-fA-F-]{36}$/), tenantId: z.string().uuid() }).strict().optional().safeParse(request.body ?? undefined);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid tenant login request.' });
    return teamsReauth.start(user.id, parsed.data);
  });
  app.delete('/api/messenger/bridge-reauth/teams', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    if (!teamsReauth) return reply.status(404).send({ error: 'Teams re-authentication is unavailable.' });
    return teamsReauth.cancel(user.id);
  });
  app.delete('/api/messenger/bridge-accounts/teams', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    if (!teamsReauth) return reply.status(404).send({ error: 'Teams account management is unavailable.' });
    const parsed = z.object({ id: z.string().min(1).max(100) }).strict().safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid account ID.' });
    try {
      await teamsReauth.removeAccount(parsed.data.id);
      return { bridges: await bridgeStatuses(true) };
    } catch (error) {
      return reply.status(502).send({ error: error instanceof Error ? error.message.slice(0, 300) : 'Removing the account failed.' });
    }
  });
  app.get('/api/messenger', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    await messenger.resume(user.id);
    const query = request.query as { roomId?: string };
    if (query.roomId && !roomId.safeParse(query.roomId).success)
      return reply.code(400).send({ error: 'Invalid room ID.' });
    return { snapshot: messenger.snapshot(user.id, query.roomId ?? null) };
  });
  app.post('/api/messenger', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const parsed = login.safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({
          error: 'A valid homeserver and Matrix credentials are required.',
        });
    try {
      await messenger.resume(user.id);
      await messenger.connect(user.id, parsed.data);
      return { snapshot: messenger.snapshot(user.id) };
    } catch {
      return reply
        .code(400)
        .send({
          error:
            'Matrix sign-in failed. Check credentials and homeserver availability.',
        });
    }
  });
  app.delete('/api/messenger', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    await messenger.resume(user.id);
    await messenger.disconnect(user.id);
    return { snapshot: messenger.snapshot(user.id) };
  });
  app.get('/api/messenger/search', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const parsed = z
      .object({ query: z.string().trim().min(1).max(200) })
      .strict()
      .safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Search text is required.' });
    return { results: await messenger.search(user.id, parsed.data.query) };
  });
  app.post('/api/messenger/keys', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    const parsed = z
      .object({ recoveryKey: z.string().min(1).max(200) })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: 'A Matrix backup recovery key is required.' });
    try {
      await messenger.restoreKeys(user.id, parsed.data.recoveryKey);
      return { ok: true };
    } catch {
      return reply
        .code(400)
        .send({
          error:
            'Could not restore encrypted history. Check the recovery key and server backup.',
        });
    }
  });
  app.post('/api/messenger/media', async (request, reply) => {
    const user = await auth(request, reply);
    if (!user) return;
    reply.header('Cache-Control', 'no-store');
    const parsed = z
      .object({
        url: z.string().max(2048).startsWith('mxc://'),
        file: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid Matrix attachment.' });
    try {
      return {
        data: (
          await messenger.media(user.id, parsed.data.url, parsed.data.file)
        ).toString('base64'),
      };
    } catch {
      return reply
        .code(400)
        .send({ error: 'Could not load or decrypt Matrix attachment.' });
    }
  });
  app.post(
    '/api/messenger/command',
    { bodyLimit: 29_000_000 },
    async (request, reply) => {
      const user = await auth(request, reply);
      if (!user) return;
      const parsed = command.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'Invalid Messenger action.' });
      try {
        return { ok: true, ...(await messenger.command(user.id, parsed.data)) };
      } catch {
        return reply
          .code(400)
          .send({
            error:
              'Matrix request failed. Check the connection and conversation before retrying.',
          });
      }
    },
  );
}
