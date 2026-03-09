/**
 * File Tools — Sprint 3.5
 *
 * file.read, file.write, file.patch, file.list, file.stat
 */
import type { ToolDefinition } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
interface FileReadInput {
    path: string;
}
interface FileWriteInput {
    path: string;
    content: string;
}
interface FilePatchInput {
    path: string;
    search: string;
    replace: string;
}
interface FileListInput {
    path: string;
}
interface FileStatInput {
    path: string;
}
export declare function createFileReadTool(registry: SurfaceRegistry): ToolDefinition<FileReadInput>;
export declare function createFileWriteTool(registry: SurfaceRegistry): ToolDefinition<FileWriteInput>;
export declare function createFilePatchTool(registry: SurfaceRegistry): ToolDefinition<FilePatchInput>;
export declare function createFileListTool(registry: SurfaceRegistry): ToolDefinition<FileListInput>;
export declare function createFileStatTool(registry: SurfaceRegistry): ToolDefinition<FileStatInput>;
export {};
//# sourceMappingURL=file-tools.d.ts.map