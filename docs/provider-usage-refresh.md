# Provider usage refresh

The Usage modal prepares subscription usage while the authenticated app is visible and active. It first reads saved gateway snapshots without contacting providers, then refreshes provider data in the background. All mounted headers and sidebars share the result. Opening the modal reuses prepared data; an initial opening before preparation completes can still wait.

Automatic refreshes have a five-minute freshness window. A one-minute client timer checks freshness, visibility, connectivity, and activity; it does not contact providers on every tick. Hidden/offline pages and clients without interaction for ten minutes stop requesting updates. Returning to the page or interacting resumes freshness checks. Opening the account menu also counts as interaction.

The gateway shares one refresh cycle per authenticated user and provider configuration across devices and tabs. The five-minute interval starts after a refresh completes. Concurrent requests join the same work. Manual Refresh can bypass successful freshness after a 30-second cooldown, but cannot bypass active requests or failure backoff. Failed cycles back off for 10, 20, then 30 minutes. A failure in one profile currently backs off the user's whole refresh cycle. Each cycle may use several provider operations; this is not a guarantee of one HTTP request per provider.

Gateway cache hits rebuild quotas from current local snapshots, preserving newer quota observations from normal chats without another provider call. Refresh diagnostics are retained. The UI's “Last checked” timestamp describes the last refresh cycle; individual quota timestamps describe provider observations. No usage is estimated from token counts.

Prepared browser data stays in memory, scoped to the current authentication token. It is cleared when the session changes; reloads warm from authenticated gateway snapshots. The gateway cache is in memory and resets on restart. Changed provider connections create a new cache identity using a digest of the relevant configuration; credentials are not returned or stored as cache keys. No migration or environment setting is required.

## Reset deadlines

Every quota row can carry a reset deadline (`resetsAt`) and its provenance (`resetSource`). Codex, Claude Code, and OpenCode Go report real deadlines; Codex sends epoch seconds and the gateway converts them to ISO timestamps. Ollama reconstructs deadlines from observed usage windows, so estimates are marked "est." in the UI. The Usage modal and Settings → Usage show a countdown ("Resets in 3h 5m"), an absolute time in the tooltip, and the provenance ("Reported by the provider", "Estimated from usage window boundaries", …). Deadlines in the past show a refresh hint instead of a countdown; rows without a usable refresh channel show no deadline at all.
