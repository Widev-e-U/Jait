import type { ContextUsage } from '@/hooks/useChat';
interface ContextIndicatorProps {
    usage: ContextUsage | null;
}
/**
 * Small donut chart showing context window usage, with a tooltip
 * breakdown by category (system prompt, history, tool results, tools).
 *
 * Inspired by VS Code Copilot's context indicator.
 */
export declare function ContextIndicator({ usage }: ContextIndicatorProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=context-indicator.d.ts.map