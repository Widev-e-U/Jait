import { and, eq } from "drizzle-orm";
import { SignJWT, importPKCS8 } from "jose";
import type { JaitDB } from "../db/index.js";
import { mobilePushRegistrations } from "../db/schema.js";
import type { UserQuestionRequest } from "./user-questions.js";

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface PushRegistration {
  deviceId: string;
  userId: string;
  token: string;
}

export function shouldDeliverQuestionPush(
  request: Pick<UserQuestionRequest, "userId" | "attention">,
): request is Pick<UserQuestionRequest, "userId" | "attention"> & { userId: string } {
  return Boolean(request.userId);
}

export class MobilePushService {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly db: JaitDB,
    private readonly serviceAccount: FirebaseServiceAccount | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnvironment(db: JaitDB): MobilePushService {
    const raw = process.env["JAIT_FIREBASE_SERVICE_ACCOUNT_JSON"]?.trim();
    if (!raw) return new MobilePushService(db, null);
    try {
      const account = JSON.parse(raw) as FirebaseServiceAccount;
      if (!account.project_id || !account.client_email || !account.private_key) throw new Error("missing fields");
      return new MobilePushService(db, account);
    } catch (error) {
      console.warn("[mobile-push] JAIT_FIREBASE_SERVICE_ACCOUNT_JSON is invalid; push disabled", error);
      return new MobilePushService(db, null);
    }
  }

  register(deviceId: string, userId: string, token: string): PushRegistration {
    const now = new Date().toISOString();
    this.db.delete(mobilePushRegistrations).where(eq(mobilePushRegistrations.token, token)).run();
    this.db.insert(mobilePushRegistrations).values({
      deviceId, userId, token, platform: "android", enabled: 1,
      createdAt: now, updatedAt: now, lastSeenAt: now,
    }).onConflictDoUpdate({
      target: mobilePushRegistrations.deviceId,
      set: { userId, token, enabled: 1, updatedAt: now, lastSeenAt: now },
    }).run();
    return { deviceId, userId, token };
  }

  unregister(deviceId: string, userId: string): boolean {
    const result = this.db.delete(mobilePushRegistrations).where(and(
      eq(mobilePushRegistrations.deviceId, deviceId),
      eq(mobilePushRegistrations.userId, userId),
    )).run();
    return result.changes > 0;
  }

  list(userId: string): PushRegistration[] {
    return this.db.select().from(mobilePushRegistrations).where(and(
      eq(mobilePushRegistrations.userId, userId),
      eq(mobilePushRegistrations.enabled, 1),
    )).all().map((row) => ({ deviceId: row.deviceId, userId: row.userId, token: row.token }));
  }

  async scheduleAlarm(userId: string, alarm: { id: string; at: number; title: string; body: string }): Promise<number> {
    if (!this.serviceAccount) return 0;
    const targets = this.list(userId);
    await Promise.all(targets.map((entry) => this.sendAlarm(entry, alarm)));
    return targets.length;
  }

  async sendQuestion(request: UserQuestionRequest): Promise<void> {
    if (!this.serviceAccount || !shouldDeliverQuestionPush(request)) return;
    const targets = this.list(request.userId);
    await Promise.all(targets.map((entry) => this.send(entry, request)));
  }

  private async send(registration: PushRegistration, request: UserQuestionRequest): Promise<void> {
    const account = this.serviceAccount;
    if (!account) return;
    const accessToken = await this.getAccessToken(account);
    const response = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: registration.token,
          data: { type: "user-question.requested", request: JSON.stringify(request) },
          android: { priority: "high", ttl: `${Math.max(0, Math.floor((Date.parse(request.expiresAt) - Date.now()) / 1000))}s` },
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || response.status === 400) {
        this.db.delete(mobilePushRegistrations).where(eq(mobilePushRegistrations.deviceId, registration.deviceId)).run();
      }
      throw new Error(`FCM send failed (${response.status}): ${body.slice(0, 300)}`);
    }
  }

  private async sendAlarm(registration: PushRegistration, alarm: { id: string; at: number; title: string; body: string }): Promise<void> {
    const account = this.serviceAccount;
    if (!account) return;
    const accessToken = await this.getAccessToken(account);
    const url = "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(account.project_id) + "/messages:send";
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { token: registration.token, data: {
        type: "alarm.schedule", id: alarm.id, at: String(alarm.at), title: alarm.title, body: alarm.body,
      }, android: { priority: "high", ttl: "86400s" } } }),
    });
    if (!response.ok) throw new Error("FCM alarm send failed (" + response.status + ")");
  }

  private async getAccessToken(account: FirebaseServiceAccount): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email)
      .setSubject(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!response.ok) throw new Error(`Firebase OAuth failed (${response.status})`);
    const result = await response.json() as { access_token: string; expires_in?: number };
    this.accessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
    return result.access_token;
  }
}
