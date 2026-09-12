# Desktop gateway hosting

Implemented for the Tauri shell. The Windows release pipeline bundles the gateway and Node runtime. Existing remote clients retain their connection behavior until the user explicitly selects a hosting mode.

## User flow

First-launch setup, the unavailable-gateway screen, and Settings → General → Gateway connection provide two choices:

- **Host on this computer** starts the bundled gateway. The default endpoint is `http://127.0.0.1:18000`; the port is configurable.
- **Connect to an existing gateway** checks and saves the server URL. This is the choice for an existing Linux gateway.

**Allow other devices to connect** changes the bind address from loopback to all IPv4 interfaces. Other devices use the host's reachable network address and configured port, then sign in and receive the existing node permissions. Firewall/network reachability remains controlled by the host's OS and network.

Applying a choice restarts the desktop shell so HTTP, WebSocket, authentication, and boot state switch together. Credentials from a different gateway are cleared before saving the new native configuration. Gateway polling does not overwrite configuration that the user is editing.

Closing the main window keeps the gateway in the tray. Explicit Quit and desktop updates stop the owned process. The existing launch-at-login setting also starts the selected local gateway. Hosting requires the machine to remain awake and the desktop process to remain running; it is not a service that survives logout.

## Ownership and storage

`gateway_host.rs` owns the child, waits for its private stdout readiness message, and bounds automatic crash restarts to three attempts per configuration/application lifetime. It does not adopt or terminate unrelated listeners. Startup failures and the last 100 log lines are shown in the UI. Logs are bounded in memory, not persisted across app restarts.

The child receives shutdown through stdin. EOF also shuts it down when its parent disappears. Windows places the gateway in a Job Object with kill-on-close so descendants are contained; normal Unix shutdown also cleans up the process group. Graceful shutdown has a forced-termination deadline.

Native hosting commands are restricted to the bundled main webview by a dedicated local capability and a native URL/window check. Remote pages and detached project windows cannot invoke them.

Configuration lives at `<Tauri app-data>/gateway-host/hosting.json`. Gateway-owned state lives in its `state/` subdirectory, including its database, signing secrets, memory, managed worktrees, provider accounts, plugins, and global skills. The private entrypoint uses an exclusive PID file to prevent concurrent ownership. State survives application updates and mode changes.

`JAIT_STATE_DIR` provides an absolute gateway-state directory without changing the OS home directory or provider CLI profiles. Without it, existing server paths remain under `~/.jait`. No database schema migration is introduced. `JAIT_DESKTOP_HOST=1` marks the desktop-owned entrypoint; gateway.redeploy directs users to desktop updates instead of spawning an unmanaged replacement.

Each gateway owns its own chats, accounts, settings, and node connections. Selecting a different gateway does not migrate these. Data transfer, gateway election, automatic failover, and phone/browser hosting are separate features.

## Distribution

`packages/gateway/scripts/package-desktop.mjs` stages the installed production dependency graph after a frozen-lockfile install. It preserves native dependencies for the packaging OS, copies the executing Node binary, and produces a directory without runtime symlink dependencies:

```
apps/desktop-tauri/src-tauri/gateway/
  runtime/node.exe                # node on Unix
  node_modules/@jait/gateway/
  node_modules/...
  manifest.json
```

The release workflow builds and validates this payload on a Windows runner, transfers it as a tar archive to the existing Linux cross-build job, and merges `tauri.gateway.conf.json` when building NSIS. This keeps normal shell development possible before the payload has been generated; a build without the payload reports that hosting is unavailable.

The gateway runtime does not require a system Node installation. External tools such as Git, provider CLIs, browsers, and optional Python-based graph tooling retain their own installation requirements. Desktop startup does not wait for graph-tool provisioning; failures are reported in its log while the core gateway remains available.

For local packaging on the intended target OS, use Node 22 or newer:

```sh
bun install --frozen-lockfile
bun run --filter @jait/shared build
bun run --filter @jait/screen-share build
bun run --filter @jait/api-client build
bun run --filter @jait/ui-shared build
bun run --filter @jait/gateway build
node packages/gateway/scripts/package-desktop.mjs
node packages/gateway/scripts/smoke-desktop.mjs
```

Build the Tauri installer with `--config tauri.gateway.conf.json --features shell,frontend`. The shipped target remains Windows NSIS; Linux/macOS installer distribution is not added by this change.

## Validation

- Shared/web/gateway contracts and all workspace TypeScript checks.
- Full repository unit suite, plus gateway selection, state-directory, and desktop update ownership regressions.
- Headless Rust tests for validation, persistence, failure reporting, process shutdown, and bounded recovery.
- Real packaged-runtime smoke test: PTY, filesystem watcher, HTTP, SQLite account persistence, stable signing secrets, duplicate ownership rejection, graceful stop, and parent-pipe closure.
- Native supervisor integration against the packaged gateway, including killing and restarting its child. Run the ignored `packaged_runtime_lifecycle` test with `JAIT_HOSTING_TEST_RESOURCES` set to the absolute packaged directory; the release workflow runs it on Windows.
- Playwright tests for local/network selection, credential clearing before switching, startup failure/retry, and remote selection.
- Windows Tauri shell cross-compilation check with `shell,frontend`.

Local runtime/lifecycle execution was verified on Linux. Native Windows runtime tests are wired into release CI; an installed Windows GUI session has not been exercised in this workspace.
