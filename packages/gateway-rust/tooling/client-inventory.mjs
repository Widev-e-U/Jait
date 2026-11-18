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

// Shape of a client candidate in normalizeClientPath's vocabulary. Adjacent placeholders form one
// dynamic segment, a placeholder glued to literal text (`/api/providers${query}`) is a suffix, and
// trailing punctuation is prose (`/api/chat:` in a comment). Literal text is kept as written.
export function clientRouteShape(candidate) {
  return candidate.replace(/[.:]+$/, "")
    .replace(/\{\}(?:\{\})+/g, "{}")
    .replace(/([^/{}])\{\}$/, "$1")
    .replace(/\/+$/, "") || "/";
}

// Routing semantics: a placeholder on either side matches any segment, and literals must agree. A client
// literal reaches a route parameter (`/api/security/findings` is served by `/api/security/:id`).
export function clientShapeMatchesRoute(shape, route) {
  const client = shape.split("/");
  const server = route.split("/");
  return client.length === server.length
    && client.every((segment, index) => segment === "{}" || server[index] === "{}" || segment === server[index]);
}
