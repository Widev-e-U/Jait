export interface QueuedMessage {
    id: string;
    content: string;
    /** timestamp when queued */
    queuedAt: number;
}
interface MessageQueueProps {
    items: QueuedMessage[];
    onRemove?: (id: string) => void;
    onEdit?: (id: string, newContent: string) => void;
    className?: string;
}
export declare function MessageQueue({ items, onRemove, onEdit, className }: MessageQueueProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=message-queue.d.ts.map