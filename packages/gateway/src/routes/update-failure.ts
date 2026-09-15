/**
 * Turn an `npm install -g` failure into something an operator can act on.
 *
 * Why this exists: the self-update route used to respond with a bare
 * `{ error: "Update failed" }`, and the web UI only rendered that one string.
 * When a release is broken (e.g. the gateway's tarball references a workspace
 * dependency version that was never published) the only useful information —
 * npm's `ETARGET: No matching version found for @jait/shared@^0.1.83` — was
 * buried hundreds of characters into `err.message` and never shown, so an
 * update failure looked like a mystery.
 *
 * This maps the failure modes we have actually hit in production to a short
 * user-facing hint plus a stable code, and keeps a trimmed tail of npm's real
 * output in `detail` for support/debugging.
 */

/** Stable identifier for the failure classes we know how to explain. */
export type UpdateFailureCode =
  | "ETARGET"
  | "E404"
  | "EACCES"
  | "ENETWORK"
  | "EBADENGINE"
  | "ETIMEDOUT"
  | "UNKNOWN";

export interface UpdateFailureDescription {
  /** Trimmed tail of npm's own output (never empty). */
  detail: string;
  /** Short, actionable explanation; `null` when we have nothing specific to say. */
  hint: string | null;
  /** Machine-readable failure class. */
  code: UpdateFailureCode;
}

/** Keep the tail, where npm puts the actual failure, not the giant progress log. */
const MAX_DETAIL_LENGTH = 1200;

function trimDetail(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_DETAIL_LENGTH) return trimmed;
  return `…${trimmed.slice(trimmed.length - MAX_DETAIL_LENGTH)}`;
}

/**
 * Describe why an install/update attempt failed.
 *
 * `err` is typically the `Error` thrown by `execSync`, whose `message` embeds
 * npm's stdout/stderr, but plain strings are accepted too.
 */
export function describeUpdateFailure(err: unknown): UpdateFailureDescription {
  const raw = err instanceof Error ? err.message : String(err);
  const detail = trimDetail(raw) || "npm install failed with no output";
  const haystack = raw.toLowerCase();
  const codeValue = (err as { code?: unknown } | null)?.code;
  const codes = typeof codeValue === "string" ? `${codeValue} `.toLowerCase() : "";

  // npm error codes may appear as `code ETARGET` in the log or as `err.code`.
  const has = (needle: string): boolean =>
    haystack.includes(needle) || codes.includes(needle);

  const result = (code: UpdateFailureCode, hint: string): UpdateFailureDescription => ({
    detail,
    hint,
    code,
  });

  if (has("etarget") || haystack.includes("no matching version found")) {
    return result(
      "ETARGET",
      "This release references a dependency version that is not published on npm, " +
        "so npm cannot resolve the install. Nothing is wrong with your machine — " +
        "the release was published incompletely. Retry later once the maintainers " +
        "re-publish the missing package, or roll back to the previous version.",
    );
  }

  if (has("e404") || haystack.includes("404 not found") || haystack.includes("not in this registry")) {
    return result(
      "E404",
      "npm could not find that package version in the registry. It may not be " +
        "published yet (the release job can lag behind the version bump) — retry " +
        "in a few minutes or install the previous version.",
    );
  }

  if (has("eacces") || has("eperm") || haystack.includes("permission denied")) {
    return result(
      "EACCES",
      "npm could not write to its global install directory. Run the gateway " +
        "under the account that owns the npm prefix, or configure a user-writable " +
        "prefix (`npm config set prefix ~/.npm-global`) and retry.",
    );
  }

  if (
    has("ebadengine") ||
    haystack.includes("unsupported engine") ||
    haystack.includes("requires node")
  ) {
    return result(
      "EBADENGINE",
      "This release requires a newer Node.js than the one running the gateway. " +
        "Upgrade Node, then retry the update.",
    );
  }

  if (has("etimedout") || haystack.includes("timed out") || haystack.includes("timeout")) {
    return result(
      "ETIMEDOUT",
      "The install timed out — the npm registry was too slow or unreachable " +
        "(proxy/firewall?). Check connectivity and retry, or raise the timeout.",
    );
  }

  if (
    has("enotfound") ||
    has("eai_again") ||
    has("econnreset") ||
    has("econnrefused") ||
    haystack.includes("network") ||
    haystack.includes("proxy")
  ) {
    return result(
      "ENETWORK",
      "Could not reach the npm registry. Check this machine's network, DNS and " +
        "proxy configuration, then retry.",
    );
  }

  return { detail, hint: null, code: "UNKNOWN" };
}
