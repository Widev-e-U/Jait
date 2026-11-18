# Native execution guard

ExecutionGuard ports deterministic call/window budgets, sticky stops, checkpoint restore, evidence deduplication and retention, normalized provider aliases, shared infrastructure failure families, hidden command failures, repeated failure hashes, recovery and exclusions for bookkeeping tools. It has no tool execution side effects. Runtime wiring remains separate.

Contracts execute the real TypeScript class and compare every public result and checkpoint. Tests cover all failure families, successful recovery across command aliases, six shared infrastructure failures, third repeated failure, optional missing files, UTF-16 prefix truncation and UTF-8 SHA256 hashes, ECMAScript numeric JSON, stripped line numbers, 130 observations with a 120-hash checkpoint tail, partially completed windows and resumed recovery. Integer nonnegative quotas/counters and JSON/scalar string result inputs define the native typed boundary; arbitrary JS programmatic values are outside it.

The source's non-Unicode regex behavior matters: ASCII case folding, ASCII word boundaries and the four JavaScript line terminators are retained. Cached regexes avoid recompiling all family patterns on each observation. A source-bound final-state-only reference mode keeps long retention scenarios under the fixed 256 KiB protocol cap without dropping assertions.

Eleven focused tests pass, including four protocol checks. Four mutations (call budget, retry limit, hidden command error handling and evidence progress) fail the original assertion and restored sources pass. Logs and guard-mutations.json are in .jait/artifacts/gateway-rust. Full source-bound gate and production activation are separate requirements.
