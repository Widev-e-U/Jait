import type { FastifyReply } from "fastify";

export interface OwnedResource {
  userId: string | null;
}

export function assertOwnership<T extends OwnedResource>(
  reply: FastifyReply,
  resource: T | null | undefined,
  userId: string,
  errorMessage: string,
): resource is T {
  if (!resource || resource.userId !== userId) {
    void reply.status(404).send({ error: errorMessage });
    return false;
  }
  return true;
}
