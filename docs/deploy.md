# Deploying Jait Gateway to a Remote Server

Step-by-step playbook for releasing and deploying `@jait/gateway` (which bundles `@jait/web`) to a remote Linux server via SSH.

---

## Prerequisites

- SSH access to the target server (e.g. `ssh user@host`)
- Node.js ≥ 20 installed on the server
- npm configured with a global prefix (e.g. `~/.npm-global`)
- A `.env` file on the server (see `.env.example` in the repo root)

---

## 1. Bump Versions

Both `@jait/web` and `@jait/gateway` must be bumped when the web UI has changed. The gateway depends on `@jait/web` via `workspace:*`, so npm will resolve it to the published version at publish time.

**Files to update:**

| Package | File | Example |
|---------|------|---------|
| `@jait/web` | `apps/web/package.json` | `"version": "0.1.26"` → `"0.1.27"` |
| `@jait/gateway` | `packages/gateway/package.json` | `"version": "0.1.43"` → `"0.1.44"` |
| `@jait/shared` | `packages/shared/package.json` | Bump only if shared schemas changed |

> **Tip:** Always bump `@jait/web` when the frontend changed, even if gateway code is unchanged — the gateway serves the web dist.

```bash
# From repo root:
git add apps/web/package.json packages/gateway/package.json
git commit -m "chore: bump web <NEW_WEB_VER>, gateway <NEW_GW_VER>"
git push
```

---

## 2. Wait for CI to Publish

Pushing to `main` with a version bump triggers `.github/workflows/release.yml`:

1. **auto-tag** — detects the version change in `packages/gateway/package.json` and creates a `v<version>` tag.
2. **Publish npm packages** — publishes `@jait/shared`, `@jait/web`, `@jait/gateway` (in dependency order, skipping already-published versions).

Monitor progress:

```bash
# List recent workflow runs
gh run list --limit 3

# Watch the publish job
gh run view <RUN_ID> --json jobs --jq '.jobs[] | select(.name == "Publish npm packages") | {status, conclusion}'
```

Verify published versions:

```bash
npm view @jait/web version
npm view @jait/gateway version
```

---

## 3. Install on the Remote Server

```bash
ssh user@host 'npm install -g @jait/gateway@<VERSION>'
```

This installs both the gateway and its `@jait/web` dependency. Verify:

```bash
ssh user@host 'node -e "
  const gw = require(\"<NPM_GLOBAL>/lib/node_modules/@jait/gateway/package.json\");
  const web = require(\"<NPM_GLOBAL>/lib/node_modules/@jait/gateway/node_modules/@jait/web/package.json\");
  console.log(\"gateway:\", gw.version, \"web:\", web.version);
"'
```

> Replace `<NPM_GLOBAL>` with the server's npm global prefix (e.g. `/home/user/.npm-global`). Find it with `npm config get prefix`.

---

## 4. Restart the Gateway

```bash
ssh user@host 'fuser -k -9 8000/tcp 2>/dev/null; sleep 3; \
  nohup /usr/bin/node <NPM_GLOBAL>/lib/node_modules/@jait/gateway/bin/jait.mjs \
    --env /home/user/.jait/.env \
    --port 8000 \
    > /home/user/.jait/gateway.log 2>&1 & \
  sleep 2; tail -5 /home/user/.jait/gateway.log'
```

Confirm the service is running:

```bash
ssh user@host 'curl -s http://localhost:8000/health'
```

---

## Quick Reference (Single Command Deploy)

For agents or scripts — bump, push, wait for publish, install, restart:

```bash
# 1. Bump & push (from repo root)
#    Edit version in apps/web/package.json and packages/gateway/package.json
git add apps/web/package.json packages/gateway/package.json
git commit -m "chore: bump web <WEB_VER>, gateway <GW_VER>"
git push

# 2. Wait for npm publish (poll until success)
gh run list --limit 1 --json databaseId,status --jq '.[0]'
# then:
gh run view <RUN_ID> --json jobs --jq '.jobs[] | select(.name == "Publish npm packages") | .conclusion'

# 3. Install & restart on server
ssh user@host 'npm install -g @jait/gateway@<GW_VER> && \
  fuser -k -9 8000/tcp 2>/dev/null; sleep 3; \
  nohup node $(npm config get prefix)/lib/node_modules/@jait/gateway/bin/jait.mjs \
    --env ~/.jait/.env --port 8000 \
    > ~/.jait/gateway.log 2>&1 & \
  sleep 2; tail -5 ~/.jait/gateway.log'
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Old web UI after update | `@jait/web` was not bumped — bump its version, push, wait for publish, reinstall gateway |
| `npm publish` skipped | Version already exists on npm — bump to a new version |
| Gateway won't start | Check `~/.jait/gateway.log` and ensure `.env` exists with valid keys |
| Port already in use | `fuser -k -9 8000/tcp` or `ss -tlnp \| grep 8000` to find the process |
