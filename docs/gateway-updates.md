# Gateway updates

`jait update [version]` and the systemd-managed web update button install into a
temporary npm prefix beside the live gateway. Installation is asynchronous and
has no whole-install timeout; npm retains its network retry limits. The running
gateway continues serving requests throughout installation.

Before activation, the updater checks the package identity, dependency manifests,
CLI, compiled entry point, and bundled web entry point. A filesystem lock excludes
concurrent web and CLI updates. An installation or validation failure removes the
candidate and leaves the running installation untouched.

For systemd installations, activation stops the gateway, moves the old installation
into the staging directory, moves the validated candidate into the original path,
and starts the service. The web updater runs activation in a separate transient
user service so that gateway shutdown cannot kill its recovery controller.
Activation waits up to three minutes for `/health` to report the expected version.
On failure it restores the previous installation, starts it, and verifies health.
This startup deadline never interrupts npm or modifies a downloading candidate.

The CLI also supports its tracked background gateway. When no managed gateway is
running, it switches the installed files and prints instructions to restart manually.
The web button requires systemd supervision; use the CLI for other installations.

Previous installations and failed candidates are retained in `.jait-update-*`
directories beside the gateway. Each directory contains `plan.json` and, after
activation, `result.json`. Activation errors from the web controller are recorded
in the user journal under `jait-update-*`. A process interruption can leave an
update lock: inspect its `owner.json`, the staging plan, running npm/controller
processes, and the live files before manually clearing it. The updater deliberately
does not assume a lock is stale just because the original gateway PID has exited.

Rollback restores software files. It does not undo database migrations or external
changes made by package installation scripts. Back up persistent data before
upgrading across releases that change database compatibility.
