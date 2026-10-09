# Persistent team conversations

The Agents page now has a team conversation for each connected reporting hierarchy. Everyone who reports to the same top-level agent shares that room. The user can participate directly; addressed members receive handoffs in separate work conversations linked from the message.

Team entry buttons and room headers compose members' saved SVG avatars, showing up to four people with an overflow count. The header animates only members whose session or thread runtime confirms they are running, and respects reduced-motion preferences. Room goals start collapsed; expanding or collapsing is remembered separately for each room within the browser session. New messages follow the latest output until you scroll up to read history; use **Jump to latest messages** to resume following.

From an ordinary chat, ask Jait to tell the team something. The `team.chat` tool posts with that chat's name and a neutral gray circle, for example **Developer Chat: Jakob said: Please review ticket #42.** Jait derives the sender from the authenticated source conversation; tool arguments cannot impersonate another profile. Agent conversations speak with their saved name and avatar.

Messages addressed to a member open an independent work chat. A busy agent can receive another ticket in another conversation. Select a member's existing work conversation, or supply `targetSessionId`, to steer that work instead. A message without recipients is a passive update; user messages and ordinary-chat relays default to the coordinator. Each handoff has a delivery status and work link. Paused or unavailable recipients surface an error.

Agents coordinate with `team.chat` assignments, questions, review requests, results, verification and blocked messages. Each work chat receives the saved persona, provider/model and skill preferences, and uses the existing chat execution and consent paths. The coordinator can set a goal with explicit acceptance criteria. Completion requires an evidence entry per criterion and a subsequent verification message from another member; these records remain reviewable by the user. They record the participants' evidence, rather than independently proving its truth.

SQLite migration 69 adds rooms, messages and deliveries. History survives reloads and gateway restarts. Retry keys prevent duplicate handoffs. Queued work resumes after restart; previously running work is marked interrupted for review instead of automatically replaying actions. Addressed handoff chains have a depth limit and dispatch runs at most eight conversations at once.

No new environment variables are required. These changes are in the source checkout; an installed gateway needs the usual build and deployment to expose them.
