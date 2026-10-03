import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { nodeCredentials, nodes } from "../db/schema.js";

export class NodeCredentialsService {
  private owners = new Map<string, string>();
  private credentials = new Map<string, { userId: string; nodeId: string }>();
  constructor(private db: JaitDB | null) {}
  owner(nodeId: string): string | null {
    if (this.db) return this.db.select().from(nodes).where(eq(nodes.nodeId, nodeId)).get()?.userId ?? null;
    return this.owners.get(nodeId) ?? null;
  }
  bind(nodeId: string, userId: string): boolean {
    const owner = this.owner(nodeId);
    if (owner && owner !== userId) return false;
    if (this.db) this.db.update(nodes).set({ userId }).where(eq(nodes.nodeId, nodeId)).run();
    this.owners.set(nodeId, userId);
    return true;
  }
  issue(nodeId: string, userId: string): string | null {
    if (this.owner(nodeId) !== userId) return null;
    const token = "jait-node-" + randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    if (this.db) this.db.insert(nodeCredentials).values({ tokenHash: hash, nodeId, userId, createdAt: new Date().toISOString() }).run();
    else this.credentials.set(hash, { nodeId, userId });
    return token;
  }
  resolve(token: string): { userId: string; nodeId: string } | null {
    const hash = createHash("sha256").update(token).digest("hex");
    const credential = this.db
      ? this.db.select().from(nodeCredentials).where(eq(nodeCredentials.tokenHash, hash)).get()
      : this.credentials.get(hash);
    if (!credential || this.owner(credential.nodeId) !== credential.userId) return null;
    return { userId: credential.userId, nodeId: credential.nodeId };
  }
  revoke(nodeId: string, userId: string): boolean {
    if (this.owner(nodeId) !== userId) return false;
    if (this.db) this.db.delete(nodeCredentials).where(eq(nodeCredentials.nodeId, nodeId)).run();
    for (const [hash, credential] of this.credentials) if (credential.nodeId === nodeId) this.credentials.delete(hash);
    return true;
  }
}
