# Team execution safeguards and model-free validation

Native tool calls use the persistent Thread ID for attribution, with the provider
session kept internal. Provider errors, quota exhaustion and bounded execution
failures cannot turn into completed Threads because a late completion event arrives.
Failed team deliveries publish one passive blocker with the work Thread reference.

Each turn is limited to 120 tool calls. Three occurrences of the same environment
failure (initial call plus two retries) stop execution, including failures through
different tool aliases. A 20-call window without new result evidence also stops
execution. Todo changes, acknowledgements, routing and coordination do not count as
new evidence. Repeated identical reads do not reset this limit. CLI workers are
interrupted and stopped on observed limit violations; native tools are checked
before execution.

Restart checkpoints retain call counts and failure counts, the original task,
latest user instruction, branch/workspace, recent tool outcomes and remaining plan.
Task anchors are queried separately from the recent activity tail, with insertion
order breaking same-millisecond timestamp ties. Recovery routing classifies the
saved task instead of generic gateway restart instructions. Explicit user resumes
start a new budget after the underlying blocker has been handled.

Saved-team agents assign new work through addressed `team.chat` messages.
`thread.control` cannot create extra relay/helper Threads from saved-team execution.
File tools resolve relative paths and `/project` aliases to the active Thread
worktree. Worktree command sandboxes expose registered Git metadata read-only;
commits use the existing host Git service and consent path.

## Run the deterministic end-to-end scenarios

```sh
bunx vitest run packages/gateway/src/routes/team-execution.e2e.test.ts
```

The test uses the real HTTP routes, native provider and agent loop, tool registry,
team service, Thread service and SQLite persistence. Its provider responses are
scripted SSE/HTTP fixtures. It replaces fetch and rejects requests to every URL
except the intercepted `.invalid` fixture endpoint; no model or external service
is contacted. Scenarios assert one addressed delivery, attributed passive results,
no quota retries or false completion, bounded environment retries, no-progress
stopping, relay/helper rejection, and recovery with task and budget preservation.
It validates harness execution, not a model's reasoning or a vendor's CLI behavior.

## Run the Docker fail-then-pass check

With Docker and `jait/sandbox:latest` available locally:

```sh
JAIT_TEST_SANDBOX=1 bunx vitest run packages/gateway/src/security/worktree-sandbox.test.ts
```

A temporary repository and worktree reproduce the broken Git pointer with the old
mount, then verify status and diff with the new metadata mount. Containers run
without network access, use the host UID/GID, and leave the main checkout unchanged.
The Docker scenario is skipped in the default unit suite.

## Native command sandbox lifecycle

The built-in provider labels each command sandbox with its gateway, owner process,
provider session and Thread. A maintenance pass runs after startup and every minute.
It releases a session sandbox after 30 minutes without activity, preserving the
session and recreating the sandbox lazily for the next command. Active turns and
containers with processes beyond the idle keepalive are retained. Docker inspection
failures also retain the container. Commands wait for any in-flight idle removal
before creating a replacement.

The mounted worktree persists across expiry; files and installed packages stored
only in the container do not. Keep durable output in the worktree. Explicit session
stop and graceful gateway shutdown also remove owned sandboxes; failed session-stop
removals are retried during maintenance.

Restart recovery removes only labelled, idle containers whose owner process has
exited, within the same gateway state directory and host PID namespace. On Linux,
process start time and boot ID prevent PID reuse from masking an exited owner.
Containers from other gateways, unknown owners and older releases without ownership
labels are retained. The pre-existing unlabelled backlog therefore needs a separate
cleanup after confirming those sessions are inactive.

Run the lifecycle regressions and the optional real Docker restart scenario:

```sh
bun run test packages/gateway/src/security/agent-sandbox-lifecycle.test.ts
JAIT_TEST_DOCKER=1 bun run test packages/gateway/src/security/agent-sandbox-lifecycle.integration.test.ts
```

The Docker test uses an isolated state directory under `.jait/artifacts/`, creates
sandboxes with networking disabled, verifies that an exited owner's idle container
is reclaimed, and retains a live owner's container and its background process.
It removes its own containers and fixture directory on completion.
