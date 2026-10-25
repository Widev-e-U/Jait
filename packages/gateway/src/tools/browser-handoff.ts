import type { PreviewService } from "../services/preview.js";
import type { UserQuestionService } from "../services/user-questions.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./contracts.js";

interface BrowserHandoffInput {
  message?: string;
  requestId?: string;
}

export function createBrowserHandoffTool(
  preview: PreviewService,
  questions: UserQuestionService,
): ToolDefinition<BrowserHandoffInput> {
  const pending = new Map<string, { sessionId: string; userId?: string; browserId: string; createdAt: string }>();

  const wait = async (requestId: string, context: ToolContext): Promise<ToolResult> => {
    const entry = pending.get(requestId);
    if (!entry || entry.sessionId !== context.sessionId || entry.userId !== context.userId) {
      return { ok: false, message: "Browser handoff not found for this user and session." };
    }
    // Keep the tool attached to this turn until an explicit user response. Progress
    // keeps MCP clients informed without returning a pending result/new turn.
    const abort = () => { questions.cancel(requestId, context.userId); };
    context.signal?.addEventListener("abort", abort, { once: true });
    const progress = setInterval(() => {
      context.onOutputChunk?.("Waiting for your browser response…\n");
    }, 15_000);
    try {
      if (context.signal?.aborted) abort();
      const outcome = await questions.waitForAnswer(requestId, context.sessionId, context.userId, { yieldAfterMs: null });
      pending.delete(requestId);
      if (outcome.status !== "answered" || !outcome.result) return {
        ok: false, message: "Browser handoff cancelled. Browser control remains with the user.",
        data: { status: "cancelled", browserId: entry.browserId },
      };
      const answer = outcome.result.answers.browser;
      const done = !answer?.skipped && !answer?.freeText && answer?.selected.length === 1 && answer.selected[0] === "Done";
      if (!done) return {
        ok: true, message: "The user is not able to complete the browser step. Browser control remains with the user. Help them or find another approach.",
        data: { status: "unable", browserId: entry.browserId, reason: answer?.freeText?.trim().slice(0, 2000) || undefined },
      };
      const current = preview.get(context.sessionId);
      if (current?.status !== "ready" || current.browserId !== entry.browserId || current.createdAt !== entry.createdAt) return {
        ok: false, message: "The user finished, but the browser changed or stopped. Control was not transferred. Open the current browser before continuing.",
        data: { status: "browser_changed" },
      };
      preview.setSharedWithAgent(context.sessionId, true);
      return {
        ok: true, message: "The user clicked Done and returned browser control to the agent. Verify the page before continuing.",
        data: { status: "done", browserId: entry.browserId, browserSession: preview.getSessionByPreviewSessionId(context.sessionId) },
      };
    } finally {
      clearInterval(progress);
      context.signal?.removeEventListener("abort", abort);
    }
  };

  return {
    name: "browser.handoff",
    description: "Give the user control of this chat's live browser and wait without a timeout while they log in, enter a password, solve a challenge, or do another browser step. Displays your message above chat input with Done and I'm not able to do it. Done explicitly returns control to the agent; unable, another reason or cancel leaves user control. The tool remains processing in this turn until the user responds. Never ask for passwords in chat.",
    tier: "standard", category: "browser", source: "builtin", risk: "low", defaultConsentLevel: "none",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Instructions for what the user should do directly in the browser. Do not include credentials.", minLength: 1, maxLength: 2000 },
        requestId: { type: "string", description: "Resume an existing pending handoff. Supply only this field." },
      },
    },
    async execute(input, context) {
      if (input.requestId) {
        if (input.message !== undefined) return { ok: false, message: "Resume with only requestId." };
        return wait(input.requestId, context);
      }
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      const message = input.message?.trim();
      if (!message || message.length > 2000) return { ok: false, message: "Provide browser instructions between 1 and 2000 characters." };
      for (const [requestId, entry] of pending) {
        if (entry.sessionId === context.sessionId && entry.userId === context.userId) return wait(requestId, context);
      }
      const browser = preview.get(context.sessionId);
      if (browser?.status !== "ready" || !browser.browserId || !browser.url) return {
        ok: false, message: "No live browser is available in this chat. Open a browser before handing control to the user.",
      };
      preview.setSharedWithAgent(context.sessionId, false);
      const requestId = questions.startResumable({
        sessionId: context.sessionId, userId: context.userId, requestedBy: "browser.handoff",
        title: "Waiting for you in the browser",
        questions: [{
          id: "browser", header: "Browser", question: message, allowFreeformInput: true,
          options: [{ label: "Done", description: "Return browser control to the agent and continue." }, { label: "I'm not able to do it" }],
        }],
      });
      pending.set(requestId, { sessionId: context.sessionId, userId: context.userId, browserId: browser.browserId, createdAt: browser.createdAt });
      return wait(requestId, context);
    },
  };
}
