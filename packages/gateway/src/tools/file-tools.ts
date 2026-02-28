/**
 * File Tools — Sprint 3.5
 *
 * file.read, file.write, file.patch, file.list, file.stat
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";

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

/** Get or create the file-system surface for a session */
function getFs(registry: SurfaceRegistry, context: ToolContext): FileSystemSurface {
  const fsId = `fs-${context.sessionId}`;
  let surface = registry.getSurface(fsId) as FileSystemSurface | undefined;
  if (!surface || surface.state !== "running") {
    throw new Error("File system surface not started for this session");
  }
  return surface;
}

export function createFileReadTool(registry: SurfaceRegistry): ToolDefinition<FileReadInput> {
  return {
    name: "file.read",
    description: "Read the contents of a file within the workspace",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative or absolute path to the file" },
      },
      required: ["path"],
    },
    async execute(input: FileReadInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = getFs(registry, context);
        const content = await fs.read(input.path);
        return {
          ok: true,
          message: `Read ${input.path}`,
          data: { path: input.path, content, size: content.length },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Read failed",
        };
      }
    },
  };
}

export function createFileWriteTool(registry: SurfaceRegistry): ToolDefinition<FileWriteInput> {
  return {
    name: "file.write",
    description: "Write content to a file within the workspace (creates parent directories)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative or absolute path to the file" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["path", "content"],
    },
    async execute(input: FileWriteInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = getFs(registry, context);
        await fs.write(input.path, input.content);
        return {
          ok: true,
          message: `Wrote ${input.path} (${input.content.length} bytes)`,
          data: { path: input.path, size: input.content.length },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Write failed",
        };
      }
    },
  };
}

export function createFilePatchTool(registry: SurfaceRegistry): ToolDefinition<FilePatchInput> {
  return {
    name: "file.patch",
    description: "Search-and-replace within a file (first occurrence)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" },
        search: { type: "string", description: "Exact text to find" },
        replace: { type: "string", description: "Replacement text" },
      },
      required: ["path", "search", "replace"],
    },
    async execute(input: FilePatchInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = getFs(registry, context);
        const result = await fs.patch(input.path, input.search, input.replace);
        if (!result.matched) {
          return { ok: false, message: `Search string not found in ${input.path}` };
        }
        return {
          ok: true,
          message: `Patched ${input.path}`,
          data: { path: input.path, matched: true },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Patch failed",
        };
      }
    },
  };
}

export function createFileListTool(registry: SurfaceRegistry): ToolDefinition<FileListInput> {
  return {
    name: "file.list",
    description: "List files and directories at a path within the workspace",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" },
      },
      required: ["path"],
    },
    async execute(input: FileListInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = getFs(registry, context);
        const entries = await fs.list(input.path);
        return {
          ok: true,
          message: `Listed ${entries.length} entries in ${input.path}`,
          data: { path: input.path, entries },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "List failed",
        };
      }
    },
  };
}

export function createFileStatTool(registry: SurfaceRegistry): ToolDefinition<FileStatInput> {
  return {
    name: "file.stat",
    description: "Get file metadata (size, type, modified date)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" },
      },
      required: ["path"],
    },
    async execute(input: FileStatInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = getFs(registry, context);
        const info = await fs.statFile(input.path);
        return {
          ok: true,
          message: `Stat ${input.path}`,
          data: { path: input.path, ...info },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Stat failed",
        };
      }
    },
  };
}
