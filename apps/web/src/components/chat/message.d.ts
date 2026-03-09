import { type ToolCallInfo } from './tool-call-card';
import type { MessageSegment } from '@/hooks/useChat';
interface MessageProps {
    messageId?: string;
    messageIndex?: number;
    messageFromEnd?: number;
    role: 'user' | 'assistant';
    content: string;
    /** Clean display text (without appended file contents). Falls back to parsing content. */
    displayContent?: string;
    /** Files the user referenced via @ chips — rendered as inline badges. */
    referencedFiles?: {
        path: string;
        name: string;
    }[];
    thinking?: string;
    thinkingDuration?: number;
    toolCalls?: ToolCallInfo[];
    /** Ordered interleaving of text and tool-call groups (from live streaming). */
    segments?: MessageSegment[];
    isStreaming?: boolean;
    compact?: boolean;
    onOpenTerminal?: (terminalId: string | null) => void;
    onEditMessage?: (messageId: string, newContent: string, messageIndex?: number, messageFromEnd?: number) => Promise<void> | void;
}
export declare function Message({ messageId, messageIndex, messageFromEnd, role, content, displayContent: displayContentProp, referencedFiles: referencedFilesProp, thinking, thinkingDuration, toolCalls, segments, isStreaming, compact, onOpenTerminal, onEditMessage, }: MessageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=message.d.ts.map