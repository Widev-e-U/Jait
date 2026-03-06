# Local-First Defaults

This document defines defaults that should work on a clean local machine without host-specific configuration.

## Goals

- Zero infrastructure by default
- Local machine first, cloud optional
- Predictable behavior for first run

## Recommended Defaults

- `OLLAMA_URL`: `http://localhost:11434`
- `PORT`: `8000`
- `WS_PORT`: `18789`
- `HOST`: `0.0.0.0`
- DB path: `~/.jait/data/jait.db`

## Anti-Patterns to Avoid

- Machine-specific LAN IPs as global defaults (for example `192.168.x.x`)
- Hidden runtime dependencies on external services
- Docs that imply cloud auth is required for local usage

## Rollout Checklist

1. Keep `.env.example` aligned with local-first defaults.
2. Keep config fallback values aligned with `.env.example`.
3. Add tests for default config loading behavior.
4. Document cloud integrations as optional, additive paths.
