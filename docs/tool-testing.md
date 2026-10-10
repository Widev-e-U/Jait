# Tool testing

Run from the repository root:

```sh
bun run test:tools
```

The verbose reporter names each tool separately. To run one tool's tests:

```sh
bun run test:tools -t 'browser.click'
bun run test:tools -t 'agent.spawn'
```

## Coverage layers

- `tool-contracts.test.ts` enables all optional registrations in `createToolRegistry`. Each of the 142 registered built-ins gets separate discovery, schema consistency, non-object argument rejection, and (where applicable) missing-required-argument checks. Invalid calls must not execute the handler or touch a service. New registrations are included automatically.
- Behavior suites exercise real handlers with isolated filesystem, scanner, provider, scheduler, account, screen-share and team service fixtures. Existing suites cover files, terminal routing, security tools, preview, profiles, threads, memory, SSH, and other integrations.
- Browser unit tests cover each of the nine page tools independently, including cancellation, user control, stopped previews, secret-safe capture suppression, failed actions, screenshot copying from an execution node and sandbox startup.
- Agent execution tests run both `agent` and `agent.spawn` through the real agent loop and tool registry with a deterministic model stream. They check the nested tool transcript and inheritance of the parent's execution node, sandbox, project and user.
- Real Chromium tests exercise navigation, snapshot, inspection, clicks, typing, scrolling, selecting, wait success/timeouts, screenshots, and standalone screenshot capture. Each case runs independently against a local HTTP fixture through the in-process, Node bridge, and packaged Node bridge drivers.

Registry contracts validate discoverability and argument handling; they do not prove a successful operation for every tool. Service fixtures do not establish that real credentials, remote devices, providers, installed scanners or external MCP servers work. Browser automation checks run headless; they do not validate the noVNC live stream or the browser panel in the web UI. No email is sent, device is controlled, network is scanned or system package installed by the isolated behavior suites.

## Real browser checks

Build the gateway first with `bun run --cwd packages/gateway build`; the packaged-runtime tests use its compiled output. Install the Chromium version required by the gateway's installed Playwright dependency, then run:

```sh
node packages/gateway/node_modules/playwright/cli.js install chromium
bun run test:tools:browser
```

A separate browser cache can be used for both commands:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/jait-tool-test-browsers node packages/gateway/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/jait-tool-test-browsers bun run test:tools:browser
```

These 30 integration checks are skipped by the regular unit command unless `JAIT_BROWSER_INTEGRATION=1` is set. When enabled, unavailable Chromium or a failed driver launch fails the suite. CI installs the matching Chromium into runner temporary storage and runs this command explicitly.

To run all tool checks including Chromium and save machine-readable per-test results:

```sh
JAIT_BROWSER_INTEGRATION=1 PLAYWRIGHT_BROWSERS_PATH=/tmp/jait-tool-test-browsers bun run test:tools --reporter=json --outputFile=/tmp/jait-tool-results.json
```

## Reproduced failures and fixes

| Regression | Before | After | Reproduction |
| --- | --- | --- | --- |
| Playwright loading in VM hosts | The evaluated dynamic import lacked an import callback; in-process startup and standalone screenshots failed | Lazy module-relative imports load the gateway dependency; both driver suites pass | `browser-tools-integration.test.ts` |
| Delegated execution routing | Nested tool context omitted `executionNodeId` and `sandboxContainerName` | Both agent tools retain the parent's execution environment | `agent-tool-execution.test.ts` |
| Installer option injection | `--allow-unauthenticated` was accepted as a package and dispatched to the package manager | Leading options are rejected before command execution | `os-tools.test.ts` |
| OS control tool schema | `device`, `controllerDeviceId` and `transport` were absent from both tool aliases' schemas | The schemas expose and validate the payloads their handlers require | `screen-share-tools.test.ts` |

The initial tool baseline had 526 passing tests. The combined release validation passed 4,700 tests (40 skipped) and 13 focused browser UI tests. The UI tests include real noVNC display, takeover typing, reload, and sharing with an isolated gateway and fresh test accounts. Matching browser binaries were absent from the default local cache; validation used a separately installed cache under `/tmp`. This does not install the binaries into the running gateway's default cache or reload the gateway with source changes.

The packaged-driver checks run outside the source checkout and fail if the published bridge helper is missing. The live browser regression test also proves that an attached CDP page is visible and receives keyboard input.
