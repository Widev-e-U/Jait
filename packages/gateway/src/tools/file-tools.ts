/**
 * File Tools — Sprint 3.5
 *
 * file.read, file.write, file.patch, file.list, file.stat
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { getFs } from "./core/get-fs.js";
import { formatEllipsedList } from "./list-preview.js";
import { basename } from "node:path";

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

interface ImageViewInput {
  path: string;
}

const IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|gif|webp)$/i;

/**
 * `image.view` results reach the chat as inline JSON, and oversized results get
 * dropped by the transport, which rendered as a broken image card. Base64 text
 * is already ~4/3 of the file size, and the bytes used to be sent twice
 * (`base64` plus the `dataUri` wrapper on top of it), so a small screenshot
 * turned into a payload far past the safe size. Anything above this budget is
 * therefore served by path instead: the chat loads it from
 * `/api/browser/screenshot`, which streams the bytes without inflating the
 * tool result (or the model context) at all.
 */
const MAX_INLINE_IMAGE_BYTES = 8_000;
const MAX_MODEL_IMAGE_BYTES = 10 * 1024 * 1024;

export function createFileReadTool(registry: SurfaceRegistry): ToolDefinition<FileReadInput> {
  return {
    name: "file.read",
    description: "Read the contents of a file within the project",
    tier: "standard",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative or absolute path to the file" },
      },
      required: ["path"],
    },
    async execute(input: FileReadInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = await getFs(registry, context, input.path);
        const content = await fs.read(input.path);
        return {
          ok: true,
          message: `Read ${input.path}`,
          data: { path: input.path, content, size: Buffer.byteLength(content, "utf8") },
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
    description: "Write UTF-8 content to a file (creates parent directories). Whitespace is preserved exactly as supplied. JSON newline escapes must decode to actual newline characters; literal backslash sequences are not decoded again.",
    tier: "standard",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative or absolute path to the file" },
        content: { type: "string", description: "Exact file content, including required trailing newlines and CRLF. Copy the raw read content, not line-numbered display text." },
      },
      required: ["path", "content"],
    },
    async execute(input: FileWriteInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = await getFs(registry, context, input.path);
        await fs.write(input.path, input.content);
        return {
          ok: true,
          message: `Wrote ${input.path} (${Buffer.byteLength(input.content, "utf8")} bytes)`,
          data: { path: input.path, size: Buffer.byteLength(input.content, "utf8") },
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
    tier: "standard",
    category: "filesystem",
    source: "builtin",
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
        const fs = await getFs(registry, context, input.path);
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
    description: "List files and directories at a path within the project",
    tier: "standard",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" },
      },
      required: ["path"],
    },
    async execute(input: FileListInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = await getFs(registry, context, input.path);
        const entries = await fs.list(input.path);
        const lines = (entries as Array<unknown>).map((e) => {
          if (typeof e === "string") return `• ${e}`;
          const obj = e as { name?: string; isDirectory?: boolean };
          if (obj?.name) return `• ${obj.name}${obj.isDirectory ? "/" : ""}`;
          return `• ${String(e)}`;
        });
        return {
          ok: true,
          message:
            `Listed ${entries.length} entries in ${input.path}` +
            (lines.length ? `:\n${formatEllipsedList(lines)}` : "."),
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
    tier: "standard",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file" },
      },
      required: ["path"],
    },
    async execute(input: FileStatInput, context: ToolContext): Promise<ToolResult> {
      try {
        const fs = await getFs(registry, context, input.path);
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

export function createImageViewTool(registry: SurfaceRegistry): ToolDefinition<ImageViewInput> {
  return {
    name: "image.view",
    description: "Display a project image in the tool card. The user already sees the image there; do not repeat it in assistant messages with Markdown image embeds, attachments, or redundant file links unless explicitly requested. Do not call after screenshot.capture or browser.screenshot: those tools already display the image. Do not call again when a tool card has already shown the image.",
    tier: "standard",
    category: "filesystem",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the image file" },
      },
      required: ["path"],
    },
    async execute(input: ImageViewInput, context: ToolContext): Promise<ToolResult> {
      try {
        const trimmedPath = input.path.trim();
        if (!IMAGE_FILE_PATTERN.test(trimmedPath)) {
          return { ok: false, message: "Only PNG, JPG, GIF, or WEBP images are supported" };
        }
        const fs = await getFs(registry, context, input.path);
        const info = await fs.statFile(input.path);
        if (info.isDirectory) {
          return { ok: false, message: `${input.path} is not a file` };
        }
        const bytes = await fs.readBinary(input.path);
        const extension = trimmedPath.match(/\.(png|jpe?g|gif|webp)$/i)?.[1]?.toLowerCase() ?? "png";
        const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "gif" ? "image/gif" : "image/jpeg";
        const inline = bytes.length <= MAX_INLINE_IMAGE_BYTES;
        const result: ToolResult = {
          ok: true,
          message: inline
            ? `Displaying image ${basename(trimmedPath)}`
            : `Displaying image ${basename(trimmedPath)} — ${bytes.length} bytes is too large to inline, so the chat loads it from its path`,
          data: {
            path: input.path,
            mimeType,
            size: bytes.length,
            modified: info.modified,
            isDirectory: info.isDirectory,
            inline,
            ...(inline ? { base64: Buffer.from(bytes).toString("base64") } : {}),
            ...(bytes.length > MAX_MODEL_IMAGE_BYTES ? { modelImageUnavailable: "Image exceeds the 10 MiB model-view limit; resize it before viewing." } : {}),
          },
        };
        if (bytes.length <= MAX_MODEL_IMAGE_BYTES) {
          Object.defineProperty(result, "modelImage", { value: { base64: Buffer.from(bytes).toString("base64"), mimeType }, enumerable: false });
        }
        return result;
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "View image failed",
        };
      }
    },
  };
}
