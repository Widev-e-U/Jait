export type ChatResumeStatus = "steered" | "not-running" | "error";
export type ThreadResumeStatus = "queued" | "not-running" | "error";

export interface ChatResumeAttempt {
  status: ChatResumeStatus;
  error?: string;
}

export interface ThreadResumeAttempt {
  status: ThreadResumeStatus;
  error?: string;
}

type ChatResumeHandler = (message: string) => Promise<ChatResumeAttempt> | ChatResumeAttempt;
type ThreadResumeHandler = (message: string) => Promise<ThreadResumeAttempt> | ThreadResumeAttempt;

class InterventionRunResumeRegistry {
  private readonly chatHandlers = new Map<string, ChatResumeHandler>();
  private readonly threadHandlers = new Map<string, ThreadResumeHandler>();

  registerChatSession(sessionId: string, handler: ChatResumeHandler): () => void {
    this.chatHandlers.set(sessionId, handler);
    return () => {
      if (this.chatHandlers.get(sessionId) === handler) {
        this.chatHandlers.delete(sessionId);
      }
    };
  }

  registerThread(threadId: string, handler: ThreadResumeHandler): () => void {
    this.threadHandlers.set(threadId, handler);
    return () => {
      if (this.threadHandlers.get(threadId) === handler) {
        this.threadHandlers.delete(threadId);
      }
    };
  }

  async resumeChatSession(sessionId: string, message: string): Promise<ChatResumeAttempt> {
    const handler = this.chatHandlers.get(sessionId);
    if (!handler) return { status: "not-running" };
    try {
      return await handler(message);
    } catch (error) {
      return {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async resumeThread(threadId: string, message: string): Promise<ThreadResumeAttempt> {
    const handler = this.threadHandlers.get(threadId);
    if (!handler) return { status: "not-running" };
    try {
      return await handler(message);
    } catch (error) {
      return {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  clearForTests(): void {
    this.chatHandlers.clear();
    this.threadHandlers.clear();
  }
}

export const interventionRunResumeRegistry = new InterventionRunResumeRegistry();
