/**
 * FolderPickerDialog — browse filesystem nodes and pick a directory.
 *
 * Shows a device/node selector at the top so users can pick which machine's
 * filesystem to browse (gateway, desktop, mobile). Defaults to the current
 * device's node if it's registered, otherwise falls back to the gateway.
 *
 * Uses the /api/filesystem/nodes, /api/filesystem/roots and
 * /api/filesystem/browse endpoints. Remote nodes are proxied through
 * the gateway via WebSocket.
 */
interface FolderPickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (path: string) => void;
}
export declare function FolderPickerDialog({ open, onOpenChange, onSelect }: FolderPickerDialogProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=folder-picker-dialog.d.ts.map