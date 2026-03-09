/**
 * Path traversal guards — Sprint 3.9
 *
 * Enforces workspace boundary, blocks symlink escapes, and
 * checks against a configurable set of denied paths.
 */
import { resolve, normalize, relative, sep } from "node:path";
import { lstat } from "node:fs/promises";
/** Paths that are ALWAYS denied regardless of workspace root */
const GLOBAL_DENIED = Object.freeze([
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
export class PathGuard {
    root;
    denied;
    checkSymlinks;
    constructor(opts) {
        this.root = resolve(opts.workspaceRoot);
        this.checkSymlinks = opts.checkSymlinks ?? true;
        this.denied = [
            ...GLOBAL_DENIED,
            ...(opts.deniedPaths ?? []),
        ];
    }
    /**
     * Validate that `target` is within the workspace boundary.
     * Returns the resolved absolute path if valid, throws otherwise.
     */
    validate(target) {
        const abs = resolve(this.root, target);
        const norm = normalize(abs);
        // Must start with workspace root
        const rel = relative(this.root, norm);
        if (rel.startsWith("..") || rel.startsWith(".." + sep)) {
            throw new PathTraversalError(`Path escapes workspace boundary: ${target}`, target, this.root);
        }
        // Check for null bytes (common injection vector)
        if (target.includes("\0")) {
            throw new PathTraversalError(`Path contains null byte: ${target}`, target, this.root);
        }
        // Check against denied paths
        for (const denied of this.denied) {
            const deniedAbs = resolve(this.root, denied);
            if (norm === deniedAbs || norm.startsWith(deniedAbs + sep)) {
                throw new PathTraversalError(`Access denied: path matches denied entry '${denied}'`, target, this.root);
            }
            // Also check if the normalized path contains the denied segment
            if (norm.toLowerCase().startsWith(deniedAbs.toLowerCase() + sep) ||
                norm.toLowerCase() === deniedAbs.toLowerCase()) {
                throw new PathTraversalError(`Access denied: path matches denied entry '${denied}'`, target, this.root);
            }
        }
        return norm;
    }
    /**
     * Validate + resolve symlinks to ensure they don't escape.
     * Use for file.write / file.patch where the target might be a symlink.
     */
    async validateWithSymlinkCheck(target) {
        const norm = this.validate(target);
        if (!this.checkSymlinks)
            return norm;
        try {
            const stat = await lstat(norm);
            if (stat.isSymbolicLink()) {
                // Resolve the symlink and check that the real path is still inside boundary
                const { realpath } = await import("node:fs/promises");
                const real = await realpath(norm);
                const rel = relative(this.root, real);
                if (rel.startsWith("..") || rel.startsWith(".." + sep)) {
                    throw new PathTraversalError(`Symlink escapes workspace boundary: ${target} -> ${real}`, target, this.root);
                }
            }
        }
        catch (err) {
            // File doesn't exist yet — that's fine for writes
            if (err.code === "ENOENT")
                return norm;
            throw err;
        }
        return norm;
    }
    /** Helper to check if a path is valid without throwing */
    isAllowed(target) {
        try {
            this.validate(target);
            return true;
        }
        catch {
            return false;
        }
    }
    get workspaceRoot() {
        return this.root;
    }
}
export class PathTraversalError extends Error {
    path;
    boundary;
    code = "PATH_TRAVERSAL";
    constructor(message, path, boundary) {
        super(message);
        this.path = path;
        this.boundary = boundary;
        this.name = "PathTraversalError";
    }
}
//# sourceMappingURL=path-guard.js.map