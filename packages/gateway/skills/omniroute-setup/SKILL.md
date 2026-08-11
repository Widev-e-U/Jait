---
name: OmniRoute Setup
description: Set up an OmniRoute AI router and connect Jait to it. Use when the user wants free/cheap models, asks to install or configure OmniRoute, picks the OmniRoute backend in settings but has no router running, or gets connection errors from the OmniRoute backend.
---

# OmniRoute Setup

You are helping the user stand up an **OmniRoute** router and point Jait at it.

OmniRoute is a self-hosted OpenAI-compatible router that fans out to ~290 upstream providers,
many with free tiers. Jait does **not** bundle it — it is a separate 3.4 GB service that the
user runs wherever they like. Your job is to get it running and wire Jait to it.

## Step 1 — Ask where it should run. Always. First.

Do not start installing before this is answered. Use the `user.ask` tool:

> **Where should OmniRoute run?**
> 1. **Docker on this Jait host** *(default — recommended)*
> 2. **npm on this Jait host** (no Docker available)
> 3. **Another machine** (NAS, Proxmox LXC/VM, second server)
> 4. **Already running** — just connect Jait to it

Recommend option 1 unless the user says otherwise: the container restarts on boot, keeps its
3.4 GB out of the host's global npm tree, and is removed again with a single command.

For option 3, also ask for the **hostname or IP**. For option 4, ask for the **full base URL**
(e.g. `http://192.168.1.50:20128/v1`).

## Step 2 — Check what is already there

Before installing anything:

```bash
curl -s -m 5 http://localhost:20128/v1/models | head -c 200   # already running?
docker --version                                              # option 1 viable?
node --version                                                # option 2 needs >= 18
```

If `/v1/models` already answers, skip to Step 4 — do not install a second copy.

## Step 3 — Install and start

### Option 1 — Docker on the Jait host (default)

```bash
docker run -d --name omniroute --restart unless-stopped --stop-timeout 40 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data diegosouzapw/omniroute:latest
```

`127.0.0.1:` binds to loopback only. Drop it to `-p 20128:20128` **only** if other machines
must reach the router — it has its own auth, but the inference API answers keyless by design,
so an exposed port is an open LLM proxy on the network.

Wait for it, then verify:

```bash
sleep 20 && curl -s -m 10 http://localhost:20128/v1/models | head -c 200
```

### Option 2 — npm on the Jait host

```bash
npm i -g omniroute          # ~3 minutes, ~3.4 GB, 127k files
omniroute serve --port 20128 --no-open
```

**Pitfall — check this before blaming the install:** an inherited `PORT` environment variable
overrides `--port`. Jait sets `PORT=8000`, so inside a Jait shell OmniRoute starts on 8000 and
collides with the gateway. Always run it as `env -u PORT omniroute serve --port 20128`.

`nohup` does not survive a reboot. For persistence use `omniroute autostart` (creates a systemd
user service on Linux) or `omniroute serve --daemon`.

### Option 3 — Another machine

Same as option 1 or 2, but on that host, and **without** the `127.0.0.1:` prefix so Jait can
reach it. Verify from the Jait host, not just locally:

```bash
curl -s -m 10 http://<host>:20128/v1/models | head -c 200
```

## Step 4 — Connect Jait

Set the base URL only if it is not the default `http://localhost:20128/v1`:

- **Settings → API keys → OmniRoute → `OMNIROUTE_BASE_URL`** — must end in `/v1`
- `OMNIROUTE_API_KEY` — **optional**, leave empty to use the keyless free tier

Then: **Settings → Jait LLM Backend → "OmniRoute"**, and pick model **`auto`** in the model
picker. Use the **Test connection** button next to the base URL to confirm before chatting.

If the gateway runs in Docker itself, `localhost` is the container — use
`http://host.docker.internal:20128/v1` instead.

## Step 5 — Verify end to end

Send one short message in a chat with backend OmniRoute and model `auto`. It should stream a
reply. If it does not, work through "Troubleshooting" below rather than guessing.

## Things that are true about OmniRoute and surprise people

Verified against version 3.8.49 — do not contradict these from memory:

- **Bare `auto` works but is not listed** in `/v1/models`. Jait adds it to the picker by hand.
  The narrower strategies (`auto/coding`, `auto/best-reasoning`, `auto/cheap`, … 38 of them)
  *are* listed.
- **`stream` defaults to true.** A request that omits the field comes back as
  `text/event-stream`, not JSON. Jait sends `stream: false` explicitly where it needs one
  complete response.
- **No key is needed for inference.** Free-tier providers are pre-wired and answer immediately.
- **The MCP endpoint always needs a key**, unlike the inference API. It answers 401 without a
  bearer token. Keys are created in the dashboard at `http://localhost:20128`.
- **Data lives in the process's HOME.** Started with an unusual HOME, the router puts its
  database somewhere unexpected. `omniroute status` prints the actual data dir — check it.

## Optional extras — only if the user asks

- **API key** for more/better upstreams: dashboard at `http://localhost:20128` → Endpoints.
  Then set `OMNIROUTE_API_KEY` in Jait's settings.
- **Route the CLI agents through it too** (Claude Code, Codex): `JAIT_ACP_VIA_OMNIROUTE=1`.
  Warn the user first — this bypasses their paid Claude/ChatGPT subscription.
- **Give agents OmniRoute's own MCP tools**: `JAIT_OMNIROUTE_MCP=1` plus a configured
  `OMNIROUTE_API_KEY`. Without the key Jait omits the MCP server rather than hand over one
  that can only 401.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Model picker shows no OmniRoute group | Router unreachable — Jait contributes nothing rather than dead entries | `curl http://localhost:20128/v1/models` |
| Router started on port 8000, collides with the gateway | Inherited `PORT` beats `--port` | `env -u PORT omniroute serve --port 20128` |
| `ECONNREFUSED` in chat | Router not running | Start it; with Docker: `docker start omniroute` |
| Works locally, not from Jait in Docker | `localhost` is the container | `OMNIROUTE_BASE_URL=http://host.docker.internal:20128/v1` |
| 401 on `/api/mcp/stream` | MCP always authenticates | Create a dashboard key, set `OMNIROUTE_API_KEY` |
| Gone after reboot | Started with `nohup` | `omniroute autostart`, or use the Docker option |

## Removing it again

```bash
docker rm -f omniroute && docker volume rm omniroute-data   # Docker
npm rm -g omniroute                                          # npm (frees ~3.4 GB)
```

Then switch **Settings → Jait LLM Backend** back to OpenAI, OpenRouter or Ollama — otherwise
chats keep targeting a router that is no longer there.
