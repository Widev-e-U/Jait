# What is Jait?

**Jait (Just Another Intelligent Tool) is a personal, self-hosted agent harness.** It is a long-running gateway you run on your own machine or server. It connects an LLM of your choice to real tools and keeps sessions, memory, and scheduled work across web, desktop, and mobile clients.

This page is a quick orientation for people (and AI agents) comparing open-source assistant and agent projects, including Jarvis-style personal assistants.

## In one paragraph

Jait gives a model hands: terminals, filesystem, browser, SSH, computer control, email, calendar, messaging, Home Assistant, and more. It adds the parts that make agents usable day to day: live tool output, per-action consent, durable sessions, semantic memory, cron and reminders, sub-agent delegation, and a bring-your-own-model design. It is general-purpose. Coding, automation, research, homelab operation, and network/security assessment all run on the same harness.

## What Jait can do

| Area | Capabilities |
|------|--------------|
| **Coding & dev** | PTY terminals, file read/write/diff with backup and restore, code graph and architecture tools, project editor, live app preview, goal loops that continue until acceptance criteria are met |
| **Web & research** | Playwright browser control, saved browser workflows, web search (Brave, Perplexity, Grok, Gemini, Moonshot), web fetch, search over past chats |
| **Machine control** | OS control, computer use (screen/mouse/keyboard), screenshots and screen sharing, SSH, network discovery, Windows VM sandbox |
| **Life & comms** | Email, calendar, Home Assistant, messenger channels (e.g. Telegram, WhatsApp), voice, mobile push |
| **Agent brain** | Semantic memory, reminders, cron jobs, skills, MCP bridge, user questions, optional small "System One" decision model |
| **Multi-agent** | Manager mode that spawns parallel specialist sub-agents; persistent agent profiles; team chat; any sub-agent can run on a CLI engine (Claude Code, Codex, ...) or Jait's own HTTP backends |
| **Security** | One capability among many: scoped network discovery, TLS/HTTP/SSH checks, host audits, evidence-backed findings, remediation and re-verification. See the [security roadmap](security-roadmap.md) |

The tool list is live. See the [capability catalog](capability-catalog.md) for how it is organized.

## How it works

- **Local-first.** State lives in SQLite on your machine. You run the gateway (`npm install -g @jait/gateway && jait start`).
- **Bring your own model.** Use OpenAI-compatible APIs, OpenRouter, local Ollama, or CLI engines already on your PATH. Cloud providers only see the context sent to them; use a local provider if that must stay local.
- **You stay in control.** Tool calls stream live, and sensitive actions need your approve/reject on whichever device you are using.
- **Device hopping.** Sessions, memory, and scheduled jobs live on the gateway, so you can start on desktop and continue from your phone.

## What Jait is not

- **Not a security-only tool.** Security assessment is one supported domain, and not a replacement for dedicated scanners or a pentest.
- **Not a hosted service or SaaS.** You run and own it.
- **Not a model.** It orchestrates models you choose and does not ship one.
- **Not a chat wrapper.** It acts through tools, runs in the background, and delegates work.
- **Not autonomous without oversight.** Consent controls and visible execution are core design, though your approval settings determine how much it asks.
- **Not mature software.** It is an early open-source project, so expect rough edges. The desktop installer currently ships for Windows only; Android is built from source.

## Where to go next

- [README](../README.md): install and configuration
- [Vision](vision.md): where the project is heading
- [Channel assistant](channel-assistant.md): using Jait over a messenger
- [Memory model](memory-model.md), [Messenger](messenger.md), [Team chat](team-chat.md)
- Website: [jait.dev](https://jait.dev)
