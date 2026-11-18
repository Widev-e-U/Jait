// Lexical URL candidates only: strings, comments and partial expressions can match.
// This scan is a review aid and does not establish an HTTP method or runtime usage.
export function clientPathCandidates(source) {
  const paths = new Set();
  for (const match of source.matchAll(/\/api\/(?:\$\{[^}]*\}|[A-Za-z0-9_.\-/:%?=&])+/g)) {
    const path = match[0].replace(/\$\{[^}]*\}/g, "{}")
      .split("?", 1)[0]
      .replace(/\/+$/, "");
    if (path) paths.add(path);
  }
  return [...paths].sort();
}

export function normalizeClientPath(path) {
  return path.replace(/:[A-Za-z_]\w*\??/g, "{}")
    .replace(/\{[^}/]*\}/g, "{}")
    .replace(/\*+/g, "{}")
    .replace(/\/+$/, "") || "/";
}
