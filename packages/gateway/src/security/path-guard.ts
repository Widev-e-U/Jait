/**
 * Path traversal guards — Sprint 3.9
 *
 * Enforces project boundary, blocks symlink escapes, and
 * checks against a configurable set of denied paths.
 */

import { resolve, normalize, relative, sep, join, isAbsolute } from "node:path";
import { lstat, realpath } from "node:fs/promises";

/** Paths that are ALWAYS denied regardless of project root */
const GLOBAL_DENIED: readonly string[] = Object.freeze([
  // Windows system dirs
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  // Unix system dirs
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/boot",
  "/proc",
  "/sys",
  "/dev",
  // Home-directory sensitive files
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
]);

export interface PathGuardOptions {
  /** Project root — all file ops are confined here */
  projectRoot: string;
  /** Extra denied paths (absolute or relative to project) */
  deniedPaths?: string[];
  /** Whether to resolve symlinks and verify they stay inside boundary */
  checkSymlinks?: boolean;
}

export class PathGuard {
  private readonly root: string;
  private readonly denied: string[];
  private readonly checkSymlinks: boolean;

  constructor(opts: PathGuardOptions) {
    this.root = resolve(opts.projectRoot);
    this.checkSymlinks = opts.checkSymlinks ?? true;
    this.denied = [
      ...GLOBAL_DENIED,
      ...(opts.deniedPaths ?? []),
    ];
  }

  /**
   * Validate that `target` is within the project boundary.
   * Returns the resolved absolute path if valid, throws otherwise.
   */
  validate(target: string): string {
    const abs = resolve(this.root, target);
    const norm = normalize(abs);

    // Must start with project root
    const rel = relative(this.root, norm);
    if (rel.startsWith("..") || rel.startsWith(".." + sep)) {
      throw new PathTraversalError(
        `Path escapes project boundary: ${target}`,
        target,
        this.root,
      );
    }

    // Check for null bytes (common injection vector)
    if (target.includes("\0")) {
      throw new PathTraversalError(
        `Path contains null byte: ${target}`,
        target,
        this.root,
      );
    }

    // Check against denied paths
    for (const denied of this.denied) {
      const deniedAbs = resolve(this.root, denied);
      if (norm === deniedAbs || norm.startsWith(deniedAbs + sep)) {
        throw new PathTraversalError(
          `Access denied: path matches denied entry '${denied}'`,
          target,
          this.root,
        );
      }
      // Also check if the normalized path contains the denied segment
      if (norm.toLowerCase().startsWith(deniedAbs.toLowerCase() + sep) ||
          norm.toLowerCase() === deniedAbs.toLowerCase()) {
        throw new PathTraversalError(
          `Access denied: path matches denied entry '${denied}'`,
          target,
          this.root,
        );
      }
    }

    return norm;
  }

  /**
   * Validate + resolve symlinks to ensure they don't escape.
   * Use for file.write / file.patch where the target might be a symlink.
   */
  async validateWithSymlinkCheck(target: string): Promise<string> {
    const norm = this.validate(target);

    if (!this.checkSymlinks) return norm;

    // A new file may be below an existing symlinked directory. Checking only
    // lstat(target) misses that case because the leaf does not exist yet.
    let realRoot = this.root;
    try { realRoot = await realpath(this.root); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
    let current = this.root;
    for (const part of relative(this.root, norm).split(sep).filter(Boolean)) {
      current = join(current, part);
      let info;
      try { info = await lstat(current); }
      catch (err) {
        // No later component can exist when this component is missing.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") break;
        throw err;
      }
      if (!info.isSymbolicLink()) continue;
      // A dangling symlink is rejected: a future write could otherwise follow it.
      const real = await realpath(current);
      const rel = relative(realRoot, real);
      if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
        throw new PathTraversalError(`Symlink escapes project boundary: ${target} -> ${real}`, target, this.root);
      }
      // A symlink must not bypass paths explicitly denied inside the project.
      this.validate(join(this.root, rel));
    }
    return norm;
  }

  /** Helper to check if a path is valid without throwing */
  isAllowed(target: string): boolean {
    try {
      this.validate(target);
      return true;
    } catch {
      return false;
    }
  }

  get projectRoot(): string {
    return this.root;
  }
}

export class PathTraversalError extends Error {
  readonly code = "PATH_TRAVERSAL" as const;
  constructor(
    message: string,
    public readonly path: string,
    public readonly boundary: string,
  ) {
    super(message);
    this.name = "PathTraversalError";
  }
}
