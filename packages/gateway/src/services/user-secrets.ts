import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { userSecrets } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export type UserSecretRecord = Omit<typeof userSecrets.$inferSelect, "encryptedValue" | "iv" | "authTag">;

export interface SaveUserSecretParams {
  userId?: string | null;
  type: string;
  key: string;
  label: string;
  value: string;
}

function normalize(value: string): string {
  return value.trim();
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`jait:user-secrets:${secret}`).digest();
}

export class UserSecretService {
  private readonly key: Buffer;

  constructor(private readonly db: JaitDB, encryptionSecret: string) {
    this.key = deriveKey(encryptionSecret);
  }

  list(userId?: string | null, type?: string): UserSecretRecord[] {
    const conditions = [userId ? eq(userSecrets.userId, userId) : isNull(userSecrets.userId)];
    if (type) conditions.push(eq(userSecrets.type, type));
    return this.db
      .select({
        id: userSecrets.id,
        userId: userSecrets.userId,
        type: userSecrets.type,
        key: userSecrets.key,
        label: userSecrets.label,
        createdAt: userSecrets.createdAt,
        updatedAt: userSecrets.updatedAt,
        lastUsedAt: userSecrets.lastUsedAt,
      })
      .from(userSecrets)
      .where(and(...conditions))
      .orderBy(desc(userSecrets.updatedAt))
      .all();
  }

  getValue(userId: string | null | undefined, type: string, key: string): string | null {
    const row = this.db
      .select()
      .from(userSecrets)
      .where(and(
        userId ? eq(userSecrets.userId, userId) : isNull(userSecrets.userId),
        eq(userSecrets.type, type),
        eq(userSecrets.key, key),
      ))
      .get();
    if (!row) return null;
    this.markUsed(row.id, userId);
    return this.decrypt(row.encryptedValue, row.iv, row.authTag);
  }

  save(params: SaveUserSecretParams): UserSecretRecord {
    const type = normalize(params.type);
    const key = normalize(params.key);
    const label = normalize(params.label);
    const value = params.value;
    if (!type) throw new Error("Secret type is required");
    if (!key) throw new Error("Secret key is required");
    if (!label) throw new Error("Secret label is required");
    if (!value) throw new Error("Secret value is required");

    const existing = this.db
      .select({ id: userSecrets.id })
      .from(userSecrets)
      .where(and(
        params.userId ? eq(userSecrets.userId, params.userId) : isNull(userSecrets.userId),
        eq(userSecrets.type, type),
        eq(userSecrets.key, key),
      ))
      .get();
    const encrypted = this.encrypt(value);
    const now = new Date().toISOString();
    if (existing) {
      this.db
        .update(userSecrets)
        .set({
          label,
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          updatedAt: now,
        })
        .where(eq(userSecrets.id, existing.id))
        .run();
      return this.getById(existing.id, params.userId)!;
    }

    const id = uuidv7();
    this.db.insert(userSecrets).values({
      id,
      userId: params.userId ?? null,
      type,
      key,
      label,
      encryptedValue: encrypted.encryptedValue,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
    }).run();
    return this.getById(id, params.userId)!;
  }

  delete(id: string, userId?: string | null): boolean {
    const existing = this.getById(id, userId);
    if (!existing) return false;
    this.db.delete(userSecrets).where(eq(userSecrets.id, id)).run();
    return true;
  }

  private getById(id: string, userId?: string | null): UserSecretRecord | undefined {
    return this.list(userId).find((secret) => secret.id === id);
  }

  private markUsed(id: string, userId?: string | null): void {
    this.db
      .update(userSecrets)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(userId ? and(eq(userSecrets.id, id), eq(userSecrets.userId, userId)) : eq(userSecrets.id, id))
      .run();
  }

  private encrypt(value: string): { encryptedValue: string; iv: string; authTag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      encryptedValue: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  private decrypt(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
