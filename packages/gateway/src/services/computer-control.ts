import { randomUUID } from "node:crypto";
import type { ComputerControlSession } from "@jait/shared";

const DEFAULT_LEASE_MS = 30 * 60_000;

export class ComputerControlSessionService {
  private readonly sessions = new Map<string, ComputerControlSession>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly leaseMs = DEFAULT_LEASE_MS,
  ) {}

  start(ownerSessionId: string, nodeId: string): ComputerControlSession {
    this.removeExpired();
    const existing = this.findByNode(nodeId);
    if (existing) {
      throw new Error(
        existing.ownerSessionId === ownerSessionId
          ? `Computer session ${existing.id} is already active on ${nodeId}`
          : `Computer ${nodeId} is already controlled by another chat`,
      );
    }

    const createdAtMs = this.now();
    const session: ComputerControlSession = {
      id: randomUUID(),
      nodeId,
      ownerSessionId,
      status: "active",
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.leaseMs).toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): ComputerControlSession | undefined {
    this.removeExpired();
    return this.sessions.get(sessionId);
  }

  requireOwned(sessionId: string, ownerSessionId: string): ComputerControlSession {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Computer session ${sessionId} is not active`);
    if (session.ownerSessionId !== ownerSessionId) {
      throw new Error(`Computer session ${sessionId} belongs to another chat`);
    }
    return session;
  }

  listForOwner(ownerSessionId: string): ComputerControlSession[] {
    this.removeExpired();
    return [...this.sessions.values()].filter((session) => session.ownerSessionId === ownerSessionId);
  }

  stop(sessionId: string): ComputerControlSession | undefined {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    return session;
  }

  private findByNode(nodeId: string): ComputerControlSession | undefined {
    return [...this.sessions.values()].find((session) => session.nodeId === nodeId);
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [sessionId, session] of this.sessions) {
      if (Date.parse(session.expiresAt) <= now) this.sessions.delete(sessionId);
    }
  }
}
