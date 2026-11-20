# Personal Messenger

Jait includes a gateway-owned Matrix connection at **Messenger** (`/messenger`). It is separate from AI Chat and Settings → Channels. It sends and receives messages as your Matrix account; personal-account bridges translate them to other services.

## Packaging

The client is built into Jait; a plugin is not required. The gateway owns the Matrix SDK and encryption store; the browser loads only the inbox UI. Synapse and bridges run as separate, optional processes. Normal Jait startup and npm installs do not pull images or start them.

The included Docker helper runs a small single-user, non-federated Synapse server with SQLite. Production multi-user deployments should use an independently managed homeserver with PostgreSQL. See [Synapse deployment instructions](https://element-hq.github.io/synapse/latest/setup/installation.html).

## Included behavior and limits

- Password sign-in or device-bound access tokens for existing/SSO accounts.
- Live conversation list, service/network labels from bridge metadata, search, unread counts and filters.
- Read/reply, invitations, earlier history, encrypted Matrix messages and encrypted attachments up to 20 MB.
- Explicit image loading, including bridge QR codes, and authenticated media downloads.
- Bridge setup conversations, Matrix direct conversations, and message-key recovery from server backup.
- Explicitly enabled Jait notifications while the client remains open. Notification previews say “New message.”
- Public Matrix read receipts with reader names and receipt times; unsupported bridge receipts remain unknown.
- Manual mark-as-read/unread synchronized through Matrix account data.
- “Mark as read” on supported notifications, scoped to the notified event so newer messages stay unread.
- Dictation through the shared composer microphone control, using Settings → speech-to-text provider. Click **Dictate**, speak, then **Done**; review the draft before sending. A delayed transcript stays with its original conversation.
- Responsive conversation navigation on narrow screens.
- WhatsApp-style reactions: hover (pointer) or press and hold (touch) a message for a quick row plus a searchable full emoji panel; reactions toggle off and show sender names.
- Compact transcript density with day dividers (`Heute`/`Today`, `Gestern`/`Yesterday`, then a short dated label) computed in your browser locale.
- WhatsApp status/story broadcasts render as a read-only per-contact feed instead of a chat log.

One Matrix account can be connected per Jait user, shared across all signed-in Jait clients. It can aggregate multiple upstream bridge logins if those bridges support them. WhatsApp, Telegram, Signal and Teams require installed/configured bridges and separate account authorization. Service buttons help address setup conversations; they do not claim a service is connected.

Not included: automatic bridge installation, provisioning APIs, simultaneous Matrix accounts, calls, reaction threads or custom emoji, native Teams activity feeds, guaranteed Teams guest-tenant coverage, push after Jait closes, interactive device verification or cross-signing setup. New direct conversations are encrypted by default. Configure bridge encryption support before opening their setup conversations. Use another Matrix client such as Element for device verification and recovery setup. Bridges requiring verified devices may need that step.

## Teams bridge operations

The optional Teams status and organization sign-in integration relies on a separately managed bridge host; the normal Jait deployment does not install or update its scripts. To deploy the tenant adapter, place the reviewed `scripts/teams-bridge/tenant-adapter.py` on that host beside its deployment-specific `teams-status-base.py`. Configure `JAIT_TEAMS_DB` and `JAIT_TEAMS_MXID` for that host, and configure `JAIT_TEAMS_STATUS_CMD` to invoke the adapter with `status`. The base probe must return JSON with an `accounts` array containing an `id` and checked `state` for each login; a missing result is shown as unknown. Configure `JAIT_TEAMS_TENANT_APPLY_CMD` to invoke the adapter with `apply` and pass the request on stdin, or provide the corresponding `teams-apply-tenant.sh` wrapper next to the existing apply wrapper. These commands and wrappers are installation-specific and may execute on a remote host. The adapter needs access to the bridge database and Microsoft endpoints; its apply operation updates credentials and restarts the bridge. Preserve the existing installation and a rollback copy when updating it. After deployment, use the Messenger refresh control to rerun the status check. The gateway caches status for up to 45 seconds; updating Jait alone does not update a remote adapter.

For message confirmations, some mautrix versions can emit status events or delivery receipts when their `message_status_events` and `delivery_receipts` options are enabled. Consult the installed bridge version's configuration before changing either setting. A trusted bridge's successful send status or receipt can confirm bridge acceptance, and a reported recipient can confirm delivery. These signals do not establish that a person read the message; Teams-to-Matrix human read receipts depend on upstream bridge support and may be unavailable.

## Message display

Bubbles use a compact, WhatsApp-like density: tight padding, small type and a narrow footer for time, edited state and read receipts. Your own messages sit on the right, everyone else on the left.

Day dividers split the transcript where the calendar day changes: today and yesterday use localized relative labels, older days use a short weekday/date label with the year only when it differs from the current one. Dividers are computed from event timestamps in the browser locale, so scrolling up stays oriented. They also appear inside status feeds.

### Reactions

Hover a message with a pointer, or press and hold it on a touch screen, to slide out a horizontal row of quick reactions plus a search button. The search button opens a full emoji panel grouped by category with a text search over emoji names and keywords; choosing one applies the reaction immediately. Tap an existing reaction badge to toggle your own reaction. Badge tooltips list who reacted when the homeserver exposes that.

Long-press cancels if the finger moves more than a few pixels, so it does not block scrolling, and the row also dismisses on outside press or `Escape`.

### Status feeds

WhatsApp bridges deliver statuses/stories as ordinary events inside a single "Status Broadcast" pseudo-conversation. Jait detects that room by name or topic and replaces the chat transcript with a read-only feed: statuses are grouped per contact, newest contact first, with a count and the latest timestamp per contact, and media inside a status is shown inline. There is no composer, no read receipts and no reaction bar there, because those actions would post into the broadcast room. Ordinary conversations keep the normal transcript.

### Teams and channels

Team platforms (Slack, Microsoft Teams, Discord, Google Chat, and Matrix spaces) arrive as a team plus one room per channel. Jait detects the shape from room state — a Matrix space is a team, a bridge channel record that is not a direct message (or any room whose parent is a team space) is a channel — and anything it cannot classify stays a plain conversation, so no room is ever hidden.

In the conversation list, teams appear as section headers showing the service and channel count with the channels' unread total; their channels sit underneath with a `#` prefix and can be folded away with the team header. The conversation filter also matches team names.

Opening a channel shows the channel identity instead of a chat header: `#` name, its team and service, and the channel topic as a banner when the room has one. Channel messages use a flat, Slack-style layout — every message keeps its sender line and a single footer row with reactions, time and options — while direct messages keep the WhatsApp-style bubbles. Threads, per-channel notifications and posting as a bot are not modelled here; the bridge relays them as ordinary messages.

## Assistant tools and shareable searches

The discoverable tools are `messenger.connect`, `messenger.status`, `messenger.rooms`, `messenger.messages`, `messenger.search`, `messenger.send`, and `messenger.open`. They operate on this personal inbox, separately from assistant bot channels.

`messenger.connect` prepares a sign-in link for an existing homeserver and optional username. Enter passwords or device tokens only in the private Messenger form. It does not sign in, install bridges, or complete upstream account authorization. After connecting, enable **Allow assistant access** in **Connections**. Access is off by default; once enabled it persists across gateway restarts and updates, and resets when the Matrix connection is disconnected. Tools continue to work when browser tabs close.

Requested room/message data passes through the gateway into the assistant conversation and may reach your configured AI provider. Matrix tokens and encryption keys stay on the gateway. Attachment bytes are decrypted there and delivered only to the authenticated owner. Read tools do not select rooms or mark messages read. Sending and opening direct conversations use the normal tool consent path. Verify an exact recipient/room ID before sending. A timeout can leave delivery uncertain; inspect the room before retrying.

Search is literal and case insensitive, over loaded decrypted timelines only: up to 50 joined rooms, 2000 events per room and 50 results. It does not establish that a message is absent from all server history. `messenger.messages` with `earlier=true` loads one additional page of up to 40 events in a specified room. Undecryptable messages remain a coverage gap. Bridge bot IDs vary; use a verified full Matrix user ID with `messenger.open` to prepare its encrypted setup conversation, then complete private login/QR steps there.

Shareable page parameters:

- `q`: the single search field. It filters conversations by name/network and matches loaded, decrypted message text.
- `service`: exact service label, such as WhatsApp or Telegram.
- `messageQ`: legacy alias still restored into the search field when opening older links.
- `roomId`: selected Matrix conversation.
- `homeserver` and `username`: private sign-in form prefill, without credentials.

For example: `/messenger?service=WhatsApp&q=firewall&roomId=%21room%3Aexample.com`. Navigation restores the search field and service filter; editing preserves the other parameters. Never put passwords, access tokens or recovery keys in links.

## Connect an existing homeserver

1. Open Messenger and enter your HTTPS homeserver URL and Matrix credentials.
2. For SSO accounts use a device-bound Matrix access token. Use a distinct device for Jait; do not share its crypto store concurrently with another client.
3. Rooms appear during synchronization. Accept bridge invitations as appropriate.
4. Open Connections for bridge setup conversations, notifications or backup-key recovery.

The gateway must be able to reach the Matrix homeserver. Browser CORS access to Matrix is unnecessary. All inbox requests use authenticated Jait routes. Loopback homeserver addresses refer to the gateway machine, including when using Jait on a phone.

## Run the included server

The helper is also included in the gateway npm package as `jait-matrix`. With an installed package use `jait-matrix <command> --project-root /path/to/your/project`. It requires an explicit project path so private data never lands inside the npm installation.

From the repository root, with Docker available to your regular user:

~~~sh
node scripts/matrix-stack.mjs init --server-name jait.local
node scripts/matrix-stack.mjs start
node scripts/matrix-stack.mjs status
node scripts/matrix-stack.mjs register
~~~

Registration prompts interactively for a Matrix username and password. Do not put credentials in terminal commands. In Messenger, connect to `http://localhost:8008` using that account. Pick a permanent server name during initialization; Matrix account and room identities depend on it.

Initialization pulls the official Synapse image and pins its digest in `.jait/artifacts/matrix/runtime.json`. Use `--image image:tag` to select a release. It generates configuration, a signing key and registration secret, disables public registration/statistics/federation, and limits uploads to 20 MB. The service binds only host loopback. Containers use the invoking UID/GID and writable HOME; root does not write into the project.

Configuration, database, keys, media and appservice registrations live in `.jait/artifacts/matrix/`, anchored to the script's checkout independently of terminal CWD. Protect and back up this directory: it contains private messages and credentials. Keep it out of Git and public artifact exports. Stopping preserves data:

~~~sh
node scripts/matrix-stack.mjs logs
node scripts/matrix-stack.mjs stop
node scripts/matrix-stack.mjs restart
~~~

Use `--port 18008` at initialization if 8008 is occupied. All commands accept `--data-dir .jait/artifacts/<directory>` for isolated runtimes. Paths outside the checkout and symlink escapes are rejected.

For remote access, configure an HTTPS reverse proxy and update Synapse's public URL, keeping its backend on loopback. On a phone, localhost means the phone; use the server's HTTPS address. Federation is disabled by default and requires an explicit deployment decision to enable.

## Connect bridges

The [mautrix setup instructions](https://docs.mau.fi/bridges/general/docker-setup.html) cover WhatsApp, Signal and Telegram prerequisites and registration. Teams support must be proven with your actual accounts and tenants.

1. Select and pin a bridge release. Put its configuration/data in `.jait/artifacts/matrix/bridges/<service>/`.
2. Set its homeserver URL to `http://synapse:8008` and its domain to your permanent server name. Grant bridge permissions to your exact Matrix user, not all users.
3. Generate its appservice registration following that bridge's instructions. Its callback URL must name the bridge's container and port on the network printed by `matrix-stack start`.
4. Run it on that Docker network, with the host UID/GID and writable HOME for project mounts. Some bridge entrypoints change ownership: bypass them using the documented direct binary, or initialize in container-owned storage and export as the host user. Never run root entrypoints against writable project mounts.
5. Register its generated file, then restart Synapse:

~~~sh
node scripts/matrix-stack.mjs register-bridge whatsapp .jait/artifacts/matrix/bridges/whatsapp/registration.yaml
node scripts/matrix-stack.mjs restart
~~~

6. In Connections, enter its exact bot ID and click Open. Send `help` and follow its login steps. Load QR images explicitly.
7. Bridged conversations appear in the shared inbox. Multiple accounts and Teams tenants depend on the bridge and organization policy; Matrix does not grant access.

Trust a bridge before installing its appservice registration: it handles upstream sessions and decrypted messages. Matrix encryption terminates there to translate protocols. See [end-to-bridge encryption](https://docs.mau.fi/bridges/general/end-to-bridge-encryption.html).

## Privacy and lifecycle

Dictation explicitly sends recorded microphone audio to Jait’s configured speech-to-text service (which may be a remote provider). It does not include conversation history or Matrix credentials. It requires Jait authentication and microphone access.

Matrix credentials/messages are not placed in Jait settings, AI chat history, or memory. Requested messages reach AI only after assistant access is enabled. Password and recovery-key inputs are cleared after submission. The access token is encrypted using a key derived from the gateway JWT secret; native Rust encryption state lives in an owner-specific private directory under `JAIT_STATE_DIR/messenger`. Back up that directory and the stable JWT secret together. The gateway uses the native Matrix Rust crypto store for live encryption. A separate official Rust WASM machine imports recovered history keys in memory because the native binding does not expose room-key import; its exported keys are encrypted before saving.

Closing a browser, reloading, navigating, or signing out of Jait disposes the UI view and leaves gateway syncing active. Gateway startup restores saved Matrix sessions without a browser. **Disconnect** logs the Matrix account out for all this user's Jait devices. Other Jait users have independent connections. Existing browser IndexedDB keys are retained during migration; sign in once through the new private form and recover history from a Matrix server backup where necessary. No token is silently copied from a browser device with a different crypto store.

Remote messages render as React text. Tokens go only to the configured homeserver; redirects are rejected. Media requests are bounded to 20 MB. Connection success does not prove that an upstream messaging account or tenant is connected. Interactive device verification still requires a compatible Matrix client.

## Validation

~~~sh
node tests/contract/run.mjs run
bun run typecheck
bun run test
bun run test:e2e -- messenger.spec.ts
bun run check:artifacts
~~~

The Rust HTTP contracts exercise two independent Jait clients, owner isolation, encrypted send/decrypt, syncing without a browser, restart persistence, and recovery of history encrypted by an independent device. The Matrix protocol peer is local; cryptography runs through the real Rust SDK. The existing opt-in browser-only Synapse fixture remains a legacy client check, not a gateway migration proof. To run that legacy fixture in isolation:

~~~sh
node scripts/matrix-stack.mjs init --server-name messenger.test --port 18008 --data-dir .jait/artifacts/matrix-validation
node scripts/matrix-stack.mjs start --data-dir .jait/artifacts/matrix-validation
JAIT_MATRIX_INTEGRATION=1 bun run test:e2e -- messenger.spec.ts
node scripts/matrix-stack.mjs stop --data-dir .jait/artifacts/matrix-validation
~~~

This creates synthetic local accounts, verifies encrypted delivery in both directions and ciphertext on the server, transfers an encrypted attachment, accepts an invitation, checks filters/mobile layout, and resumes a session after refresh. Real messenger accounts are not connected. Keep local test credentials and raw browser traces private. With an HTTP proxy, include localhost and 127.0.0.1 in NO_PROXY for Playwright.

The inbox reuses Jait’s `Conversation`, `Message`, `PromptInput`, `ChatComposerSurface`, and attachment components. Their messenger mode keeps the shared scrolling, keyboard, mobile, and copy behavior while omitting AI controls and project reference chips. File selection, paste, and drop upload through the authenticated gateway, which encrypts and sends them to Matrix. Personal conversation text is rendered literally.
