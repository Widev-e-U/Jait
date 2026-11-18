# Saved browser workflows and Stagehand

Jait uses Stagehand 4.3.0 for discovering controls and extracting structured data
from its visible Docker browser. Jait stores workflow definitions and runs each
saved action through the gateway executor, including its existing consent,
cancellation and human-control checks. Stagehand does not execute model-selected
actions inside these tools. Replay uses explicit selectors and does not require
inference unless the definition includes an extraction step.

## Using the tools

1. Open the target with `browser.open`.
2. Use `browser.observe` with one concrete instruction, such as “Find the invoice
   month field.” It returns supported candidate `step` objects. Review the target
   and execute a candidate with the normal `browser.type`, `browser.click` or
   `browser.select` tool. Unsupported methods and frame/shadow selector chains
   are explicitly reported and cannot be silently translated.
3. Save the successful sequence with `browser.workflow.save`. Define named,
   non-secret string inputs and replace values with `{{inputName}}`. The first
   step must be `open`. Add `check` steps for deterministic expected results.
   Use `checkpoint` for login; credentials belong in the browser, never the
   definition or input defaults.
4. Read it with `browser.workflow.get`, then call `browser.workflow.run` with
   its `id`, reviewed `expectedRevision` and optional `values` map. Progress
   appears as nested browser tool cards in the chat's existing live browser.
5. Inspect `browser.workflow.runs`, or call `browser.workflow.cancel` with
   `runId`. Definitions and history are scoped to the user and project.

Supported steps: `open`, `navigate`, `click`, `type`, `select`, `wait`, `snapshot`,
`check`, `extract`, `checkpoint`. A `check` requires `selector` and optionally
`text` that the element must contain. An `extract` requires `instruction` and
`fields`: an array of `{ name, description, type }`, where type is `string`,
`number`, `boolean` or `strings`. Extraction results are returned under the run's
`outputs` and in nested tool results. The dedicated history stores progress and
an immutable definition snapshot, without resolved input values or page data;
normal chat/scheduler tool-result retention still applies.

A failed check, denied action, cancelled run or unsuccessful handoff stops the
sequence. There is no automatic retry of uncertain effects. After a process
restart, unfinished runs become `interrupted`. After a page change, inspect and
repair the relevant selector, verify the revised action, then save with `id` and
`expectedRevision` to create a new revision. There is no automatic selector
repair during replay.

Scheduling uses the existing `cron.add` tool with `browser.workflow.run` and its
reviewed revision and input. Scheduling grants no extra consent; a login
checkpoint or pending approval needs an operator. Updating a definition makes
jobs pinned to the previous revision fail until they are explicitly updated.

## Model and browser setup

Discovery and extraction require an API key for OpenAI, Anthropic or Gemini in
Jait Settings (or the corresponding gateway environment variable). They select
an available provider in that order. `BROWSER_STAGEHAND_MODEL` can pin a model,
using `openai/…`, `anthropic/…` or `google/…`. Defaults are
`openai/gpt-4.1-mini`, `anthropic/claude-sonnet-4-5` and
`google/gemini-2.5-flash`. CLI subscriptions do not supply an inference API key.
Page content goes to the selected model; secret-safe sessions block these calls.

Open a new Docker live browser after rebuilding the gateway. Its image enables
extension debugging and the SDK's bundled extension directory is mounted
read-only at the same absolute path. The extension connects to Chromium's
internal WebSocket endpoint, while the gateway uses the published endpoint.
The published debugger port binds to host loopback. Only the specific extension
origin is allowed for debugger WebSocket requests.
The adapter selects Jait's visible target ID and detaches after each request,
without closing the live browser. Cancellation drains the SDK request and
resets the extension before releasing the browser; managed provider requests
may need to settle before cleanup completes. Host-only browser drivers are not
supported by this adapter. Node deployments require Node 22.18 or newer, as required by the
pinned SDK.

Stagehand's Browserbase cloud cache is disabled. Jait owns local definitions and
replay; no Browserbase account is required. Existing URL/SSRF protections still
apply to navigation. These are browser automation tools, not a security scanner
or a grant of authorization to assess the target. Download completion is not
currently a supported workflow assertion; a page check alone does not establish
that an invoice file was downloaded successfully.

## Validation

Unit/regression tests:

```sh
bunx vitest run packages/gateway/src/services/browser-workflows.test.ts \
  packages/gateway/src/services/browser-intelligence.test.ts \
  packages/gateway/src/tools/browser-intelligence.test.ts
```

The deterministic integration test runs the actual shipping Docker browser,
Stagehand extension, SDK, Jait browser tools, SQLite workflow storage and consent
executor. Its scripted model reads Stagehand's real accessibility tree. It checks
XPath conversion, typed extraction, two replay runs with changed inputs, approval
before each click, zero inference during replay, failure when an expected
result is missing, cancellation without closing the live browser, and discovery
after cancellation on that same browser:

```sh
JAIT_STAGEHAND_INTEGRATION=1 bunx vitest run \
  packages/gateway/src/tools/browser-stagehand.integration.test.ts
```

To also test a real configured model, explicitly set
`JAIT_STAGEHAND_LIVE_MODEL=1`. That test performs discovery and extraction on a
synthetic fixture page, fails on missing/invalid credentials, and is skipped by
default. For the local Ollama endpoint instead, run:

```sh
JAIT_STAGEHAND_INTEGRATION=1 JAIT_STAGEHAND_LIVE_MODEL=ollama bunx vitest run \
  packages/gateway/src/tools/browser-stagehand.integration.test.ts
```

The Ollama fixture adapter defaults to `http://localhost:11434` and
`deepseek-v4.1-flash:cloud`; override with `OLLAMA_URL` and
`JAIT_STAGEHAND_OLLAMA_MODEL`. It caps actual inference requests at three with
no retries and a 25-second timeout per request. Both live variants replay the
discovered click with two changed inputs through consent. Replay makes no model
requests. The `:cloud` model uses cloud inference through the local endpoint.
Only synthetic page data is sent. Ollama cloud does not enforce JSON schemas;
the test supplies the schema in the prompt and validates the response. This
adapter is test-only; gateway provider setup remains as documented above.
A deterministic integration pass is not evidence of model quality or success
on an arbitrary authenticated website.

Upstream contracts: [observe](https://docs.stagehand.dev/v4/basics/observe),
[extract](https://docs.stagehand.dev/v4/basics/extract),
[browser integration](https://docs.stagehand.dev/v4/configuration/browser),
[models](https://docs.stagehand.dev/v4/configuration/models).
