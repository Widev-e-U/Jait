# Manual Jait provider evaluations

This is an opt-in, paid task benchmark, separate from the normal test suite. It runs through the existing gateway chat API with provider `jait`, the normal prompt builder, tool registry/discovery, and consent handling. Each task runs in a fresh workspace with its own Git root and agent-mode session. This keeps the checkout’s ignored report folder from hiding fixture files during search. A separate judge runs through Jait in ask mode, with read-only tools, the worker trace, independent checks, and a task-specific rubric.

## Run it

Use a source checkout with dependencies installed, Bun and Git available. Your normal gateway must be running with your chosen Jait LLM backend configured. Every live run reads its account settings, then starts a private local gateway with a fresh temporary SQLite database, a new evaluation account, and an ephemeral loopback port. It never sends eval sessions or chat requests to the normal gateway. The private process and database are removed when the run finishes, including errors and cancellation. Run on the **gateway host** so the runner and Jait see the same absolute fixture paths. PowerShell 7 works on Windows and Linux.

First list tasks, without any model requests:

```powershell
./scripts/agent-eval.ps1 -List
```

Set `JAIT_EVAL_TOKEN` to a Jait login/access token for the account whose backend and tool permissions you want to evaluate. It is sent only to the normal gateway to read backend settings. Backend credentials and disabled-tool settings are copied into the private database, never printed or saved in reports. The script does not print or store this token. Use an evaluation account if you want separate permissions and history. Port defaults to 8000; pass `-Gateway` if your gateway differs.

Run explicitly with a model identifier supported by that account's Jait backend:

```powershell
./scripts/agent-eval.ps1 -Run -Model 'your-model-id' -Concurrency 3
./scripts/agent-eval.ps1 -Run -Model 'your-model-id' -JudgeModel 'your-judge-model-id' -Tasks patch-and-verify,discover-file-tool -Repeat 3
```

The same judge model is used by default. Pin `-ReasoningEffort` too when your backend supports it. Without this option, Jait's account default applies. Backend/account configuration, tool permissions, skills and gateway version also affect comparisons; hold these constant. The private database starts without saved memories, prior chats or projects. Requested models are recorded; the runner does not assert that an upstream router used that exact model.

Review a saved aggregate report through the same UI, without model calls:

```powershell
./scripts/agent-eval.ps1 -ReportPath evaluations/runs/<timestamp>/report.json
```

Without PowerShell:

```sh
bun run scripts/agent-eval.ts --list
bun run scripts/agent-eval.ts --run --model your-model-id --tasks patch-and-verify --concurrency 2
```

PowerShell displays worker/judge starts, live tool calls, tool failures, verdicts and findings. No `-Run` / `--run` means no model calls. Nothing adds paid runs to CI or `bun run test`.

## Starter suite: ten tasks

Tasks are ordered by increasing scope and complexity, rather than a measured difficulty score:

| Order | Task | Focus |
| --- | --- | --- |
| 1 | read-and-report | Read, write, verify a result |
| 2 | discover-file-tool | Discover and execute file.stat |
| 3 | recover-missing-file | Recover from an intentional error |
| 4 | patch-and-verify | Repair a function and test behavior |
| 5 | search-live-config | Search source while excluding decoys |
| 6 | preserve-exact-bytes | Unicode, whitespace, CRLF and byte verification |
| 7 | merge-config | Nested immutable merge and falsy overrides |
| 8 | repair-pagination | Caller/helper repair, validation and ordering |
| 9 | bounded-async-map | Concurrency limits, stable order and failure propagation |
| 10 | inventory-pipeline | JSONL parsing, scope filtering, deduplication and CLI integration |

The inventory case processes synthetic observations only; it authorizes no network calls or scanners. Task-specific tool requirements are part of the rubric. Independent checks live in the runner manifest so workers cannot pass by rewriting a provided test file. Offline suite tests prove broken baseline fixtures fail and correct artifacts pass; they do not establish model reliability.

## What the judge evaluates

Outcome and process are separate:

- **PASS:** Independent checks and judge agree on success; no significant process issues.
- **ISSUES:** The task may work, but the judge found failed tools, problematic workarounds, missing verification, or uncertainty.
- **FAIL:** Independent checks or judge say the requested behavior failed.
- **ERROR:** Provider failure, timeout, required approval/input, malformed judging output, trace limit, or an unverifiable judge citation.

A valid alternative approach is allowed unless the task explicitly requires a particular tool. For example, `discover-file-tool` requires discovery and `file.stat`; a shell workaround is a process failure. A missing-file error in `recover-missing-file` is intentional. The judge is an LLM and may misjudge; inspect cited call IDs and calibrate its rubric against your review. Independent checks cannot be overridden by a judge saying “pass.”

Full worker and judge event traces, workspace references, per-task reports, the suite snapshot and aggregate `report.json` are saved under `evaluations/runs/<timestamp>/`. A timestamped directory is never reused. Reports retain session IDs for correlation with saved traces. Treat these local reports like chat history: tool output may contain private data. They are not automatically published. Eval sessions/projects exist only in the private database, which is removed after shutdown. Review saved traces and artifacts; their session IDs do not refer to chats in your normal gateway.

The judge can inspect `evidence.json` and a subject artifact snapshot, but ask mode prevents it from editing the result. Trace evidence is marked untrusted; fabricated tool-call citations produce ERROR. Artifact snapshots omit symlinks, dependency folders, and files beyond 200 entries or 256 KB, with omissions recorded in evidence.json. Complete traces are used, with a size ceiling rather than silently clipping evidence. Large tasks may require a larger-context judge and adjusted `--max-trace-bytes`.

## Limits and cancellation

Each worker and judge has a default five-minute timeout and 60 tool-call limit. Concurrency defaults to three concurrent task pipelines, each with one active worker or judge. The suite can be repeated up to 20 times. `-TimeoutSeconds` and `-MaxToolCalls` adjust the limits. Ctrl+C requests cancellation of active gateway sessions. Cancellation failures are reported; the private gateway is still stopped and its database removed before the runner exits.

Existing consent rules still apply. The runner does not auto-approve tools. The fresh evaluation account uses the gateway’s normal consent defaults plus the source account’s disabled-tool settings; existing consent history is not copied. Approval or user-input requests stop an evaluation rather than hanging indefinitely; review the saved trace and configure the intended evaluation permissions before rerunning. These limits bound execution, not exact currency spend: model pricing and token usage differ. The script makes a separate paid judge run per attempted task. A malformed JSON verdict gets at most one additional judge request, with the same per-request timeout and tool-call limits. Both original and retry traces are retained; `judgeFormatError` records the first failure, and `judgeRetry` records the retry. The CLI reports this as a format retry. Provider failures and fabricated citations remain errors without retry. It records streamed metrics but does not invent dollar estimates.

Worker fixtures are created in separate temporary directories, away from suite manifests and report ancestry. `workspace.json` and each report retain the absolute workspace path; the judge receives an artifact snapshot after the worker stops. Fixtures are retained for review. The worker is instructed to stay within its fixture, but full-access tools do not enforce an OS sandbox.

Judge input retains executed tool arguments, results, errors, terminal output, and assistant claims. It omits reasoning/token/argument streaming fragments and records their counts; adjacent terminal output fragments are joined without clipping. Complete raw event traces remain in the per-task trace files. The byte ceiling still cancels a run rather than grading incomplete evidence.

Fresh fixture folders isolate test data, **not the entire host**. Task agents use the account's real tools and permissions. Do not add tasks that affect unrelated projects or services. Fixtures cannot have absolute paths or traverse outside their workspace; file checks reject symlink escapes. Verifier commands are trusted suite code, executed as argument arrays with no shell and a timeout.

A remote gateway requires HTTPS and `-SharedWorkspace` / `--shared-workspace`, and the output path must be mounted at the **same absolute path** on both hosts. Otherwise run the script directly on the gateway host. This runner does not copy fixtures to remote nodes.

## Add a task

Add an object to `evaluations/basic.json`, or point `-Suite` at another manifest:

```json
{
  "id": "read-config",
  "title": "Read a fixture config",
  "prompt": "Read config.json and write answer.json with the same port.",
  "fixtures": { "config.json": "{\"port\":8080}" },
  "checks": [{ "type": "json", "path": "answer.json", "equals": { "port": 8080 } }],
  "rubric": ["Was the source actually read?", "Were tool failures or workarounds hidden?"]
}
```

Supported independent checks: exact text file, structural JSON equality, and command executable plus argument array (exit zero). Put important behavior checks in the manifest's verifier command rather than a test file the subject can rewrite. The subject sees its task prompt and fixture files; success checks stay in the runner. Include realistic failures from your own traces as new cases.

## Free implementation checks

```sh
bunx vitest run --config vitest.config.ts packages/gateway/src/evaluation/agent-eval.test.ts
```

These tests mock the gateway/model boundary and validate stream decoding, reports, concurrency, cancellation and judging. They make no paid calls. PowerShell is a presentation wrapper around the same runner.
