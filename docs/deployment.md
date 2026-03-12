# Jait Deployment Guide

Instructions for bumping versions and deploying the Jait gateway + web frontend to the production server.

## Overview

The deployment pipeline has two paths:

| Method | When to use |
|--------|-------------|
| **Self-deploy via `gateway.redeploy` tool** | Gateway is running and reachable — use the agent's built-in tool |
| **Manual SSH deploy** | First install, recovery, or when gateway is down |

Both paths follow the same high-level flow:

1. Bump version(s) in the repo
2. Commit and push to `main`
3. Wait for CI to publish npm packages (~3–5 min)
4. Install the new packages on the server
5. Restart the gateway process

---

## Server Details

| Property | Value |
|----------|-------|
| Host | `192.168.178.60` |
| SSH user | `jakob` |
| Gateway port | `8000` |
| Node binary | `/usr/bin/node` |
| Gateway entrypoint | `/home/jakob/.npm-global/lib/node_modules/@jait/gateway/bin/jait.mjs` |
| Env file | `/home/jakob/.jait/.env` |
| Log file | `/home/jakob/.jait/gateway.log` |

---

## Step 1: Bump Versions

### Option A: Use the release script (recommended for full releases)

```bash
# From repo root — bumps root + all workspace packages + shared VERSION constant
bun scripts/release.ts patch        # 0.1.38 → 0.1.39
bun scripts/release.ts minor        # 0.1.39 → 0.2.0
bun scripts/release.ts 0.2.0        # explicit version
```

This script:
1. Bumps `package.json` version in the root
2. Runs `version-sync.ts` to propagate to all workspace `package.json` files and `packages/shared/src/constants/index.ts`
3. Commits as `release: vX.Y.Z`
4. Creates a `vX.Y.Z` git tag

After running it, just push:
```bash
git push && git push --tags
```

### Option B: Bump individual packages manually

When only specific packages changed, bump just those:

```bash
# Edit the version field in each relevant package.json:
#   packages/gateway/package.json    — always bump when gateway code changed
#   apps/web/package.json            — bump when frontend code changed
#   packages/shared/package.json     — bump when shared types/constants changed
#   packages/screen-share/package.json — bump when screen-share code changed

# Then commit and push:
git add -A
git commit -m "fix: <description>, gateway X.Y.Z, web X.Y.Z"
git push
```

**Important**: The CI auto-tag job triggers on pushes to `main` that touch `packages/gateway/package.json`, `packages/shared/package.json`, or `apps/web/package.json`. The gateway version is the source of truth for the release tag.

---

## Step 2: Wait for npm Publish

After pushing, the GitHub Actions `release.yml` workflow:
1. Detects the version change and creates a `v<version>` git tag
2. Publishes packages to npm in dependency order: `@jait/shared` → `@jait/screen-share` → `@jait/web` → `@jait/gateway`

**Poll until the gateway package is available** (typically 3–5 minutes):

```bash
# Check if the new version is on npm:
npm view @jait/gateway@<VERSION> version

# Example polling loop (PowerShell):
while ($true) {
  $v = npm view "@jait/gateway@0.1.39" version 2>&1
  if ($v -eq "0.1.39") { Write-Host "Published!"; break }
  Write-Host "Waiting..."; Start-Sleep 30
}

# Example polling loop (Bash):
while ! npm view @jait/gateway@0.1.39 version 2>/dev/null | grep -q 0.1.39; do
  echo "Waiting..."; sleep 30
done
echo "Published!"
```

**Do not proceed to Step 3 until the npm package is confirmed available.** Installing before publish completes will install the old version.

---

## Step 3: Deploy to Server

### Option A: Use `gateway.redeploy` tool (recommended)

If the gateway is already running on the server, use the built-in self-update tool:

```
Use the gateway.redeploy tool with version "<VERSION>"
```

The tool will:
1. Run `npm install -g @jait/gateway@<version>` on the server
2. Spawn a canary process on port 8001 and health-check it
3. If healthy: kill the canary, then either restart via systemd or spawn a replacement process
4. If unhealthy: abort and keep the current version running

This handles zero-downtime switchover automatically.

**Note**: `gateway.redeploy` installs the gateway package which pulls `@jait/web` and `@jait/shared` as dependencies, so all packages update together.

### Option B: Manual SSH deploy

When the gateway is down or the redeploy tool isn't available:

```bash
# 1. Install new packages
ssh jakob@192.168.178.60 "npm install -g @jait/gateway@<VERSION> @jait/web@latest 2>&1"

# 2. Kill existing gateway and restart
ssh jakob@192.168.178.60 "fuser -k -9 8000/tcp 2>/dev/null; sleep 3; nohup /usr/bin/node /home/jakob/.npm-global/lib/node_modules/@jait/gateway/bin/jait.mjs --env /home/jakob/.jait/.env --port 8000 > /home/jakob/.jait/gateway.log 2>&1 & sleep 2; tail -5 /home/jakob/.jait/gateway.log"
```

**Key details**:
- Use `fuser -k -9 8000/tcp` (SIGKILL) — SIGTERM may not be enough if child processes hold the port
- Wait `sleep 3` after kill to ensure the port is fully released
- Use `nohup ... &` so the gateway survives SSH disconnect
- Check the last few log lines to confirm successful startup

---

## Step 4: Verify

```bash
# Check the gateway is responding:
ssh jakob@192.168.178.60 "curl -s http://127.0.0.1:8000/health"

# Check the running version:
ssh jakob@192.168.178.60 "tail -5 /home/jakob/.jait/gateway.log"
```

---

## Full Copy-Paste Sequence (Manual)

One-shot deploy after code changes (replace `X.Y.Z` with actual versions):

```bash
# 1. Bump & push
git add -A
git commit -m "fix: <description>, gateway X.Y.Z, web X.Y.Z"
git push

# 2. Wait for npm (poll every 30s)
while ($true) {
  $v = npm view "@jait/gateway@X.Y.Z" version 2>&1
  if ($v -eq "X.Y.Z") { Write-Host "Published!"; break }
  Write-Host "Waiting..."; Start-Sleep 30
}

# 3. Install & restart
ssh jakob@192.168.178.60 "npm install -g @jait/gateway@X.Y.Z @jait/web@latest 2>&1"
ssh jakob@192.168.178.60 "fuser -k -9 8000/tcp 2>/dev/null; sleep 3; nohup /usr/bin/node /home/jakob/.npm-global/lib/node_modules/@jait/gateway/bin/jait.mjs --env /home/jakob/.jait/.env --port 8000 > /home/jakob/.jait/gateway.log 2>&1 & sleep 2; tail -5 /home/jakob/.jait/gateway.log"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `EADDRINUSE` on restart | `fuser -k -9 8000/tcp` wasn't used, or didn't wait long enough. Run it again with `sleep 5`. |
| npm install gets old version | The CI pipeline hasn't finished publishing. Re-check with `npm view @jait/gateway@X.Y.Z version`. |
| Gateway starts but web is old | `@jait/web` wasn't published yet or npm cache is stale. Run `npm cache clean --force` on the server, then reinstall. |
| Canary health check fails (redeploy tool) | The new version has a startup bug. Check logs on port 8001. The old gateway keeps running — no downtime. |
| Port 8000 occupied after kill | A child process inherited the port. Use `fuser 8000/tcp` to find the PID, then `kill -9 <PID>`. |
