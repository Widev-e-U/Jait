# Using OmniRoute with Jait

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) is a self-hosted, OpenAI-compatible router
that fans requests out to ~290 upstream providers, many with a free tier. Jait talks to it as one
more LLM backend alongside OpenAI, OpenRouter and Ollama.

**Jait does not bundle OmniRoute.** It is a separate application with its own database, dashboard
and release cycle, and it is an optional backend — Jait only ever knows a URL. The bundled
**"OmniRoute Setup"** skill walks through the installation: ask about OmniRoute in a chat and an
agent takes it from there.

> Everything below was verified against **OmniRoute 3.8.49**, not copied from its documentation.

## Quick start — Docker on the Jait host (recommended)

```bash
docker run -d --name omniroute --restart unless-stopped --stop-timeout 40 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data diegosouzapw/omniroute:latest
```

The `127.0.0.1:` prefix binds to loopback only. Drop it if other machines must reach the router —
but be aware the inference API answers **without authentication by design**, so an exposed port is
an open LLM proxy on your network.

Verify:

```bash
curl -s http://localhost:20128/v1/models | head -c 200
```

The image is ~0.5 GB, considerably smaller than a global npm install of the same version.

## Alternative — npm on the host

```bash
npm i -g omniroute                                  # ~3 minutes, 3.4 GB, 127k files
env -u PORT omniroute serve --port 20128 --no-open
```

The `env -u PORT` is not decoration: **an inherited `PORT` variable overrides `--port`.** Jait sets
`PORT=8000`, so inside a Jait shell the router starts on 8000 and collides with the gateway.

For persistence use `omniroute autostart` (systemd user service) or `omniroute serve --daemon`. A
`nohup` does not survive a reboot.

## On a different host

Same as above, without the `127.0.0.1:` prefix, then verify **from the Jait host** rather than
locally:

```bash
curl -s http://<host>:20128/v1/models | head -c 200
```

## Connecting Jait

1. **Settings → API keys → OmniRoute**
   - `OMNIROUTE_BASE_URL` — only needed if it is not `http://localhost:20128/v1`. Must end in `/v1`.
   - `OMNIROUTE_API_KEY` — **optional**; leave empty to use the keyless free tier.
   - `OMNIROUTE_MODEL` — optional fallback model when the picker has not selected one.
2. Click **Test connection**. The probe runs from the gateway, not from your browser — that is the
   connection that actually has to work.
3. **Settings → Jait LLM Backend → "OmniRoute"**
4. Pick **`auto`** in the model picker.

If the gateway itself runs in Docker, `localhost` is the container:
`OMNIROUTE_BASE_URL=http://host.docker.internal:20128/v1`.

## Models

The catalogue is fetched live from `/v1/models` and appears in the picker as its own "OmniRoute"
group.

- **`auto`** — the router decides per request. It works, but is **not** listed by `/v1/models`, so
  Jait adds it to the picker by hand.
- **`auto/coding`, `auto/best-reasoning`, `auto/cheap`, …** — 38 narrower strategies, all listed.
- Concrete model ids such as `openai/gpt-4o` or `deepseek/deepseek-r1`.

When the router is not running the group is empty. That is deliberate: offering models that cannot
answer is more misleading than showing no group at all.

## Optional switches

| Env | Effect |
| --- | --- |
| `JAIT_ACP_VIA_OMNIROUTE=1` | Also routes the Claude Code and Codex CLI agents through the router (`ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`). **This bypasses a paid Claude/ChatGPT subscription**, so it is strictly opt-in. |
| `JAIT_OMNIROUTE_MCP=1` | Additionally hands CLI agents OmniRoute's own MCP server (routing, providers, combos, cache, memory). Requires `OMNIROUTE_API_KEY`; without one Jait omits the server rather than handing over a ref that can only 401. |

## Privacy

The router forwards to up to ~290 third parties. Some free tiers permit training on submitted data —
the project flags 15 providers accordingly. Jait chats contain repository contents. Which upstreams
are used is controlled in the OmniRoute dashboard.

## Where OmniRoute departs from "OpenAI-compatible"

These three behaviours are the reason for specific handling in the gateway. They are easy to
rediscover the hard way:

- **`stream` defaults to true.** A request that omits the field returns `text/event-stream`, not
  JSON. `callJaitLlmCompletion()` therefore sends `stream: false` explicitly; without it, thread
  titles, commit messages and plan generation fail on a `res.json()` parse error.
- **Model ids contain slashes** (`openai/gpt-4o`, `auto/coding`). `resolveJaitLlmConfig()` resolves
  the `omniroute` branch **before** the OpenRouter heuristic, which keys off `includes("/")` and
  would otherwise redirect every OmniRoute request to openrouter.ai.
- **The MCP endpoint always authenticates**, unlike the inference API, and answers 401 without a
  bearer token.

Two more things that surprise people: bare `auto` is usable but unlisted (see Models above), and the
router stores its database under the HOME of whatever process started it — `omniroute status` prints
the real path.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No OmniRoute group in the picker | Router unreachable | Use **Test connection** in settings |
| Router started on port 8000 | Inherited `PORT` beats `--port` | `env -u PORT omniroute serve --port 20128` |
| "Could not connect to omniroute at …" in chat | Router not running | `docker start omniroute`, or start the service |
| Works locally, not from Jait in Docker | `localhost` is the container | `http://host.docker.internal:20128/v1` |
| 401 from the MCP endpoint | MCP always authenticates | Create a dashboard key, set `OMNIROUTE_API_KEY` |
| Gone after a reboot | Started with `nohup` | `omniroute autostart`, or use Docker |

## Removing it

```bash
docker rm -f omniroute && docker volume rm omniroute-data   # Docker
npm rm -g omniroute                                          # npm, frees ~3.4 GB
```

Then switch **Settings → Jait LLM Backend** back to OpenAI, OpenRouter or Ollama — otherwise chats
keep targeting a router that no longer exists.
