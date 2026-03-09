/**
 * Convert ThreadActivity[] into ChatMessage[] so Manager-mode activities
 * can be rendered with the same Message component used in Developer mode.
 *
 * Grouping logic:
 *  - A `message` activity with role=user produces a standalone user message.
 *  - Consecutive tool activities (tool.start / tool.output / tool.result / tool.error / tool.approval)
 *    are collected into a single assistant message's `toolCalls` array.
 *  - A `message` activity with role=assistant produces an assistant message
 *    (text content). If it immediately follows tool calls, those are folded
 *    into the same assistant message; otherwise a new one is started.
 *  - `session` and `error` kinds produce lightweight assistant messages.
 */
import type { ThreadActivity } from '@/lib/agents-api';
import type { ChatMessage } from '@/hooks/useChat';
export declare function activitiesToMessages(activities: ThreadActivity[]): ChatMessage[];
//# sourceMappingURL=activity-to-messages.d.ts.map