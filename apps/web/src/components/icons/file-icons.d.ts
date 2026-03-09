/**
 * File & folder icons powered by vscode-icons (MIT).
 *
 * Uses `vscode-icons-js` for the filename→icon mapping and loads the
 * actual SVGs from the jsDelivr CDN (cached at the edge).
 *
 * @see https://github.com/vscode-icons/vscode-icons
 * @see https://github.com/dderevjanik/vscode-icons-js
 */
/**
 * Renders the appropriate vscode-icons file icon for a given filename.
 */
export declare function FileIcon({ filename, className, }: {
    filename: string;
    className?: string;
}): import("react").JSX.Element;
/**
 * Renders a folder icon (closed or open) for a given folder name.
 */
export declare function FolderIcon({ name, open, className, }: {
    name: string;
    open?: boolean;
    className?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=file-icons.d.ts.map