import { z } from "zod";

/** A loop belongs to one chat and never grants additional tool permissions. */
export const ChatLoopSchema = z.object({
  id: z.string().min(1),
  goal: z.string().trim().min(1).max(8000),
  criteria: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
  status: z.enum(["running", "paused", "waiting", "completed", "error"]),
  iteration: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  checkedIteration: z.number().int().min(-1),
  summary: z.string().max(8000),
  nextMessage: z.string().max(8000),
  evidence: z.array(z.string().max(2000)).max(20),
  updatedAt: z.string(),
});
export type ChatLoop = z.infer<typeof ChatLoopSchema>;

export function readChatLoop(metadata: unknown): ChatLoop | null {
  try {
    const value = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const parsed = ChatLoopSchema.safeParse(value?.loop);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
