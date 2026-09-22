# System One Model

Settings → API configuration → **System One Model** accepts a TypeSafe Jev API key (`JEV_API_KEY`) and optional model (`JEV_MODEL`, default `jev-latest`). It is per-user and opt-in; clearing the key disables automatic requests on subsequent turns. No database migration is required. The main chat model remains responsible for generation.

Configured accounts use System One for:

- Tool discovery and initial tool selection in web chat, Jait threads, and channels.
- Ordering available skills in prompt context (all enabled skills remain available).
- Reranking retrieved, scope-filtered chat memories before the existing five-memory injection limit.
- Advisory recovery selection when the existing investigation-progress guard fires. It cannot override loop limits, permissions, or completion evidence.
- `decision.evaluate`, advertised in native and external chat prompts. It batches bounded choices, scores against ordered levels, and yes/no probabilities.

Requests go to `https://api.typesafe.ai/v1/systemone`, following the [TypeSafe API contract](https://docs.typesafe.ai/introduction/quickstart). Candidate descriptions, selected memory/skill text, and relevant request context are sent to TypeSafe; credentials and unrelated session history are not included in the state. Tool visibility and disabled-tool filtering happen before semantic selection; channel allowlists still constrain exposed tools.

Automatic ranking considers at most 48 candidates, starting with local lexical matches. It preserves the original behavior on errors, malformed results, cancellation, or a 1.5-second timeout. A 15-second per-credential circuit breaker avoids repeatedly waiting for an unavailable service. Bounded 30-second caches are isolated by credential and full request. `decision.evaluate` reports failure explicitly so the calling model can reason normally.

This is a ranking/decision integration, not a prompt rewriting or text generation service. Memory scope, user instructions, permission checks, and execution authority stay with Jait. External coding agents use the prompt guidance and MCP discovery; Jait does not alter their internal provider loops.
