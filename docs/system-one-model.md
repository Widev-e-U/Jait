# System One Model

Settings → API configuration → **System One Model** points at any model the account configures. The `SYSTEM_ONE_*` fields are preferred:

| Field | Purpose |
| --- | --- |
| `SYSTEM_ONE_BASE_URL` | OpenAI-compatible base URL (e.g. `https://api.openai.com/v1` or `http://localhost:11434/v1`). When set, requests go to `<base>/chat/completions`. |
| `SYSTEM_ONE_API_KEY` | Bearer token. Optional for keyless local endpoints. |
| `SYSTEM_ONE_MODEL` | Model id sent with each request. |
| `SYSTEM_ONE_TIMEOUT_MS` | Per-request timeout (capped at 120s; defaults to 20s for generic endpoints, 1.5s for TypeSafe). |

The legacy TypeSafe Jev fields (`JEV_API_KEY`, `JEV_MODEL`, default `jev-latest`) keep working for existing accounts and are used when no generic base URL is set. System One is per-user and opt-in; clearing the key (and base URL) disables automatic requests on subsequent turns. No database migration is required.

The Jait provider's own reasoning model is called the **System Two Model**; it stays responsible for generation. Configure its named backends in the System Two Model section of Settings.

Configured accounts use System One for:

- Tool discovery and initial tool selection in web chat, Jait threads, and channels.
- Ordering available skills in prompt context (all enabled skills remain available).
- Reranking retrieved, scope-filtered chat memories before the existing five-memory injection limit.
- Advisory recovery selection when the existing investigation-progress guard fires. It cannot override loop limits, permissions, or completion evidence.
- `decision.evaluate`, advertised in native and external chat prompts. It batches bounded choices, scores against ordered levels, and yes/no probabilities.

With no `SYSTEM_ONE_BASE_URL`, requests go to `https://api.typesafe.ai/v1/systemone`, following the [TypeSafe API contract](https://docs.typesafe.ai/introduction/quickstart). Otherwise they go to the configured OpenAI-compatible chat/completions endpoint with a JSON-object response format. Candidate descriptions, selected memory/skill text, and relevant request context are sent to the configured endpoint; credentials and unrelated session history are not included in the state. Tool visibility and disabled-tool filtering happen before semantic selection; channel allowlists still constrain exposed tools.

Automatic ranking considers at most 48 candidates, starting with local lexical matches. It preserves the original behavior on errors, malformed results, cancellation, or a 1.5-second timeout. A 15-second per-credential circuit breaker avoids repeatedly waiting for an unavailable service. Bounded 30-second caches are isolated by credential and full request. `decision.evaluate` reports failure explicitly so the calling model can reason normally.

This is a ranking/decision integration, not a prompt rewriting or text generation service. Memory scope, user instructions, permission checks, and execution authority stay with Jait. External coding agents use the prompt guidance and MCP discovery; Jait does not alter their internal provider loops.
