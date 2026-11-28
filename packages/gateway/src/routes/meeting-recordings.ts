import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { MEETING_MAX_BYTES, MEETING_UPLOAD_CHUNK, type MeetingSetup } from "@jait/shared";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { requireAuth } from "../security/http-auth.js";
import type { UserService } from "../services/users.js";
import type { UserSecretService } from "../services/user-secrets.js";
import { emptyMeetingSettings, meetingEndpoint, MeetingEndpoints, meetingServices, type MeetingConfiguration } from "../meetings/endpoints.js";
import { MeetingJobs } from "../meetings/jobs.js";

const text = z.string().trim().max(500);
const settingsSchema = z.object({
  parakeetUrl: text, nemotronUrl: text, nemotronModel: text, obsidianUrl: text, obsidianVault: text,
  obsidianToken: z.string().trim().max(2000).regex(/^[\x21-\x7e]*$/).optional(),
});
const jobId = z.string().uuid();
const createSchema = z.object({
  id: jobId, startedAt: z.string().datetime(), totalBytes: z.number().int().min(1).max(MEETING_MAX_BYTES),
  mimeType: z.string().regex(/^audio\/(webm|ogg|mp4|wav|aac|mpeg)(;codecs=[a-z0-9., -]+)?$/i).max(100),
});
const chunkSchema = z.object({
  offset: z.number().int().min(0).max(MEETING_MAX_BYTES),
  audio: z.string().min(4).max(Math.ceil(MEETING_UPLOAD_CHUNK / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const prefix = "/api/meeting-recordings";
const secretType = "meeting-recording";
const secretKey = "configuration";

function setup({ obsidianToken, ...settings }: MeetingConfiguration): MeetingSetup {
  const hasObsidianToken = !!obsidianToken;
  return { ...settings, hasObsidianToken, configured: hasObsidianToken && Object.values(settings).every(Boolean) };
}

export function registerMeetingRecordingRoutes(app: FastifyInstance, jwtSecret: string, users: UserService, secrets: UserSecretService, sqlite: SqliteDatabase) {
  const read = (userId: string): MeetingConfiguration => {
    const value = secrets.getValue(userId, secretType, secretKey);
    return value ? JSON.parse(value) as MeetingConfiguration : { ...emptyMeetingSettings, obsidianToken: "" };
  };
  const jobs = new MeetingJobs(sqlite, read);
  let testing = false;
  app.addHook("onReady", async () => { jobs.start(); });
  app.addHook("onClose", async () => { await jobs.close(); });
  void app.register(async (routes) => {
    const ownerByRequest = new WeakMap<FastifyRequest, string>();
    routes.addHook("onRequest", async (request, reply) => {
      const user = await requireAuth(request, reply, jwtSecret);
      if (!user) return;
      if (!users.isOwner(user.id)) return reply.code(403).send({ error: "Only the gateway owner can configure or use meeting recording." });
      ownerByRequest.set(request, user.id);
    });
    const owner = (request: FastifyRequest) => ownerByRequest.get(request)!;

    routes.get("/settings", async (request) => setup(read(owner(request))));
    routes.put("/settings", { bodyLimit: 8192 }, async (request, reply) => {
      const userId = owner(request);
      const parsed = settingsSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid meeting settings." });
      const { obsidianToken, ...settings } = parsed.data;
      try {
        for (const key of ["parakeetUrl", "nemotronUrl", "obsidianUrl"] as const) {
          if (settings[key]) meetingEndpoint(settings[key]);
        }
      } catch {
        return reply.code(400).send({ error: "Use HTTP(S) endpoint URLs with explicit ports and a private IP or localhost." });
      }
      const configuration = { ...settings, obsidianToken: obsidianToken ?? read(userId).obsidianToken };
      secrets.save({ userId, type: secretType, key: secretKey, label: "Meeting recording settings", value: JSON.stringify(configuration) });
      return setup(configuration);
    });
    routes.post("/test", { bodyLimit: 4096 }, async (request, reply) => {
      const configuration = read(owner(request));
      if (!setup(configuration).configured) return reply.code(409).send({ error: "Complete and save meeting settings first." });
      if (testing) return reply.code(409).send({ error: "A connection test is already running." });
      testing = true;
      try {
        return await Promise.all(meetingServices.map(async service => {
          try {
            await new MeetingEndpoints(configuration).test(service);
            return { service, ok: true };
          } catch {
            return { service, ok: false };
          }
        }));
      } finally { testing = false; }
    });
    routes.get("/jobs", async (request) => jobs.get(owner(request)));
    routes.post("/jobs", { bodyLimit: 4096 }, async (request, reply) => {
      const userId = owner(request);
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid recording." });
      if (!setup(read(userId)).configured) return reply.code(409).send({ error: "Complete meeting settings first." });
      return jobs.create(userId, parsed.data) ?? reply.code(409).send({ error: "A recording is already pending." });
    });
    routes.put<{ Params: { id: string } }>("/jobs/:id/audio", { bodyLimit: 710_000 }, async (request, reply) => {
      const userId = owner(request);
      const parsed = chunkSchema.safeParse(request.body);
      if (!parsed.success || !jobId.safeParse(request.params.id).success || parsed.data.audio.length % 4 !== 0) {
        return reply.code(400).send({ error: "Invalid audio chunk." });
      }
      return jobs.append(userId, request.params.id, parsed.data.offset, Buffer.from(parsed.data.audio, "base64"))
        ?? reply.code(409).send({ error: "The recording cannot accept audio at this offset." });
    });
    for (const action of ["submit", "retry"] as const) {
      routes.post<{ Params: { id: string } }>(`/jobs/:id/${action}`, { bodyLimit: 4096 }, async (request, reply) => {
        const userId = owner(request);
        if (!setup(read(userId)).configured) return reply.code(409).send({ error: "Complete meeting settings first." });
        return jobs.submit(userId, request.params.id, action === "retry")
          ?? reply.code(409).send({ error: "The recording upload is incomplete or missing." });
      });
    }
    routes.delete<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
      return jobs.discard(owner(request), request.params.id)
        ? { ok: true } : reply.code(409).send({ error: "This recording cannot be discarded." });
    });
  }, { prefix });
}
