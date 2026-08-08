# The channel assistant

What Jait is when you reach it over a messenger.

Telegram is the first connector, not the design. Everything in this document is
connector-agnostic on purpose: Discord, WhatsApp and Signal are meant to inherit
the same assistant by implementing `ChannelConnector`, without a second copy of
the behaviour.

## Where the pieces live

| Concern | File |
| --- | --- |
| Who the assistant is, what it is expected to do | `packages/gateway/src/channels/assistant.ts` |
| Lifecycle, inbound→agent→outbound, commands | `packages/gateway/src/channels/manager.ts` |
| One messenger's mechanics (typing, buttons, edits) | `packages/gateway/src/channels/<id>/connector.ts` |
| Delivery back into a chat, reminders | `packages/gateway/src/tools/channel-tools.ts` |
| One-off schedules | `packages/gateway/src/scheduler/service.ts` |
| Writing skills at runtime | `packages/gateway/src/skills/install.ts` |

`assistant.ts` holds prose meant for a model, not for a reader of the file. It
is the single place to change what the assistant *is*; the manager only decides
when to run it.

## The four things that make it an assistant

### 1. It keeps its own continuity

A chat keeps `maxHistory` turns (20 by default) and nothing else. That is a
limitation of the surface, and the user should never pay for it.

The assistant is told to reach for `memory.search` and `session.search` before
admitting it lacks context, and to `memory.save` durable facts unprompted. Those
tools are in `CHANNEL_ACTIVATED_TOOLS`, so their schemas are in every request
rather than behind a `tools.search` round trip — a model that has to go looking
usually doesn't, and answers "I don't have that context" instead.

### 2. It schedules its own reminders

"Remind me tomorrow at 5" goes through `channel.remind`:

- `at: "2026-08-09T05:00"` — a local wall clock, no offset, no `Z`. It becomes
  the cron minute `0 5 9 8 *` plus `once: true`.
- `cron: "0 7 * * 1-5"` — a recurring routine, left armed.
- `text` for a fixed message, `prompt` to work the answer out at delivery time.

Cron cannot express a year, so a one-off would otherwise come back annually.
What happens to it after it fires depends on how it went:

| Outcome | What the scheduler does | Why |
| --- | --- | --- |
| Delivered | Deletes the job and its runs immediately | A spent reminder in the job list is clutter the user has to filter out |
| Failed | Disarms it, then deletes after 24h | Deleting on the spot would hide the failure exactly when it matters |
| Manually triggered | Nothing | Trying a reminder must not cancel it |

The 24-hour sweep (`purgeSpentOneShots`) runs from the scheduler's own tick, at
most hourly — not as a seeded cron job. A cleanup the user can disable is a
cleanup that eventually stops running, and the job list would then fill with
exactly the entries it exists to remove. Run rows are deleted with their job:
they are keyed by job id with no foreign key behind them, so an orphan is a row
nothing can ever join back to a name.

Times are read in the channel's zone (`config.timeZone`, else the host's), never
in UTC. The zone, the current local time and the conversation id are injected
into every turn by `buildChannelContextBlock` — the model cannot guess any of
them, and a reminder addressed to the wrong chat fails silently.

Delivery goes through `ChannelManager.deliver()`, which queues behind the
conversation lock. A `prompt` delivery is a normal turn in that conversation:
same model, same history, same approvals.

### 3. It survives a broken model

`runAgentLoop` reports a rejected key as an `error` event carrying the provider's
HTTP status; it does not throw. The channel watches for 401/402/403/429 and, when
the turn produced no answer at all, retries once on another model:

1. the channel's `fallbackModel` (`/model fallback <id>`), else
2. the gateway default — but only when this channel had overridden it, since
   retrying the same model with the same rejected credential fails identically.

The fallback covers exactly one message. `config.model` is never rewritten: a
rescue is not a decision the user made. The chat says which model failed, so a
dead key surfaces instead of quietly degrading.

CLI providers (Claude Code, Codex) answer in prose rather than status codes, so
`looksLikeCliAuthFailure` reads their wording narrowly. A false positive costs
one extra attempt; a false negative just surfaces the original message.

### 4. It writes its own skills

`skills.manage` gained a `create` action: id, name, description, markdown body →
`~/.jait/skills/<id>/SKILL.md`, followed by re-discovery so the skill is live in
the next turn. Ids are slugified (`../../etc` cannot climb out), frontmatter is
quoted (a colon in a description would otherwise become a nested mapping), and
an existing skill is never clobbered without `overwrite`.

The assistant is instructed to do this unprompted when it works out something
reusable, then mention it in one line.

## Adding a messenger

1. Implement `ChannelConnector` (`channels/types.ts`). Only `start`, `stop`,
   `send`, `status` and `currentQr` are required.
2. Add the optional capabilities the platform has: `startTyping` (own the repeat
   cadence — the manager only calls the returned stop function), `sendLive` /
   `editLive` for live progress, `supportsChoices` for tappable options,
   `setCommandMenu` to publish the slash commands.
3. Register it with `channelManager.register()`.

Nothing above needs touching. Commands, reminders, memory, fallback and the
assistant's instructions come from the manager and `assistant.ts`.

The one rule worth repeating: **anything platform-specific stays in the
connector.** The manager knows there is a typing indicator; it does not know
Telegram expires it after five seconds.
