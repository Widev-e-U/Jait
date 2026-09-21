# Notification navigation and context

Investigation: 2026-09-20. Implementation continued: 2026-09-21. The findings below describe the original code; see implementation status at the end. Native-device smoke testing remains outstanding.

## Goal and proposed behavior

A notification should tell the user which project/chat needs attention, what happened, and take them to that exact context when tapped, including when the app must start first.

| Event | Content | Tap destination | Additional actions |
| --- | --- | --- | --- |
| Response complete | Project + chat title; short plain-text response preview | Chat and relevant response | Open chat; later, mark read |
| Question | Project + chat title; question text | Chat with pending question visible | Existing Android choices/reply; open chat |
| Approval | Project + chat title; operation requiring approval | Chat with pending approval visible | Preserve existing explicit approval/rejection actions |
| Thread finished/failed | Project + thread title; accurate outcome | Correct thread and result/error | Open thread |
| Other notification | Meaningful title and detail | Its supported internal destination | Destination-specific only |

Use one completion card per chat, updated for later completions, with grouping across chats. Do not suppress new turns just because the previous turn finished less than a minute ago. Avoid an OS completion alert while that exact chat is visible and focused on the device; other chats and requests needing action still notify. Keep notification preferences and a message-preview setting explicit. Opening a chat clears its read completion card; answering a request clears its outstanding cards across devices using the existing attention mechanism.

## Findings in this checkout

- `apps/web/src/lib/system-notifications.ts`: common input has id/title/body/level but no destination. Browser click handler only forgets its handle. Native desktop/Android calls forward only id/title/body. In-app toast has no navigation action.
- `apps/web/src/hooks/useUICommands.ts:272`: gateway notification handler accepts `link` but drops it. The gateway's `JaitNotification` already supports optional `link` in `packages/gateway/src/services/notifications.ts`.
- `apps/web/src/App.tsx:1096`: completion text is generic; it omits project, chat title, response preview and structured destination. Thread completion includes a title in its body but no target. There is no focus/visibility guard in these completion effects.
- `packages/gateway/src/routes/chat.ts:5084` and `services/mobile-push.ts:129`: Android completion push similarly has only id/title/body. Push uses `chat-complete:<session>` while the frontend uses `chat-complete:<session>:<local-counter>`. These do not deduplicate as one event.
- `apps/mobile/android/app/src/main/java/dev/jait/mobile/ChatNotifications.java`: expanded text is already supported. Tap opens MainActivity with no session/project extras. Dedupe remembers only the last ID for 60 seconds; push/WebView IDs can produce duplicate cards, while repeated push-only turns in one chat can be suppressed. This is a source-level finding, not a reproduction on the user's phone.
- `JaitMessagingService.java`: question notifications can open the native question UI and expose choices/reply; other attention notifications use a generic app-launch intent. Attention items already contain sessionId, but it is not used for navigation. `AttentionActionReceiver.java` already handles approve/reject/options/inline question replies. Preserve this capability.
- `apps/desktop/src-tauri/guest-js/shim.js:268`: notification bridge strips target metadata and ignores id; closeNotification is a no-op. `apps/desktop/crates/jait-desktop-glue/src/lib.rs:1130` emits title/body/urgency only.
- `apps/desktop/src-tauri/src/shell.rs:76`: notification sink implements Linux/macOS commands but does nothing on Windows. Tauri notification plugin 2.3.3 is registered, but this bridge does not call it. This does not establish where the user's observed Windows notifications originate: installed build/version and browser-vs-native source still need verification on Windows.
- `apps/web/src/hooks/useProjects.ts:181`: startup selection already reads sessionId/projectId query parameters. `useViewRouting.ts` handles main views and a browser jait:// parameter, not a complete native notification handoff. Tauri single-instance code currently handles focus/open-folder, not chat activation. Reuse session selection rather than creating a second chat-loading path.

## Platform feasibility

Android supports a notification PendingIntent opening the app with destination data and the expected Back navigation. Existing Java/Capacitor infrastructure is sufficient. Handle both the launch intent and later intents while the Activity already exists, retaining the target until the authenticated web UI is ready. See [Android notification navigation](https://developer.android.com/develop/ui/views/notifications/navigation).

Windows supports native toast activation and content-related navigation. It requires a real notification backend and installed application identity/activation integration. Tauri's stock Actions API is explicitly mobile-only, so registering onAction is not a Windows solution. See [Tauri notifications](https://v2.tauri.app/plugin/notification/), [Tauri desktop implementation](https://raw.githubusercontent.com/tauri-apps/plugins-workspace/v2/plugins/notification/src/desktop.rs), and [Microsoft desktop notification activation](https://learn.microsoft.com/en-us/windows/win32/shell/quickstart-sending-desktop-toast).

## Approach choices

1. Text-only changes plus stock Tauri send: smallest change, but fails the essential requirement to open the right chat.
2. Shared notification target with platform-native adapters: recommended. Reuse Android notifications; add a Windows toast adapter supporting activation and stable IDs; route both through the existing web app's selection logic.
3. Full notification inbox, read-state database and interactive actions everywhere: useful later, but significantly broader than fixing tap behavior, context and duplicate alerts.

For Windows, prototype protocol activation from a real toast through the installed NSIS app first. Tauri deep-link registration plus its single-instance integration can carry navigation to the running app or a newly launched app. If the selected Windows backend/installer cannot meet persisted-toast activation requirements, use COM/App SDK activation instead. Decide the Rust backend after this small installed-app proof, rather than promising stock-plugin support. See [Tauri deep linking](https://v2.tauri.app/plugin/deep-linking/) and [Microsoft app notification quickstart](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/notifications/app-notifications/app-notifications-quickstart?tabs=cpp).

Clicking a previously delivered notification after the app exits is separate from receiving new notifications while it is fully closed. New Windows push/background delivery is outside this first phase. Android's existing FCM path remains the background delivery mechanism.

## Ordered implementation work

1. Define a shared optional notification target and metadata in `packages/shared/src`, consumed by `services/notifications.ts` and `system-notifications.ts`. Separate unique event ID (turn/request, shared by push and WebSocket) from replacement/group ID (chat). Target carries trusted gateway/account scope, projectId, sessionId or threadId, and optional request/message ID. Never infer destination by parsing presentation text or dedupe IDs.
2. Extend completion/attention producers and `mobile-push.ts` with the same payload. Include existing project/chat titles and a bounded plain-text response preview, with no extra model call. Preserve a useful generic fallback. Cover error/cancel/success distinctions and queue draining.
3. Add one app navigation handler using `App.tsx`, `useProjects.ts`, and `useViewRouting.ts`. Buffer native activation until auth/project data are ready, then consume once. Preserve unsent drafts. Handle missing/deleted chats, offline gateways and stale/resolved requests explicitly. Forward legacy supported `link` values without allowing arbitrary external URLs or shell actions.
4. Android: extend `AgentOverlayPlugin.notify`, `ChatNotifications`, `JaitMessagingService`, and MainActivity/plugin intent handling. Store target extras in uniquely identified intents; consume on both initial and subsequent launches through a retained native event/get-pending contract. Add an Open chat action to rich question UI while keeping existing reply flows. Use the shared IDs for dedupe/replacement and grouping; cancel the correct native card when read.
5. Windows: add a native toast module, update shim/glue payload contracts, implement show/update/remove plus activation, and register installer/single-instance handling. Restore the appropriate window, queue the target until its renderer is ready, and reuse step 3. Surface backend failure so a silent successful no-op cannot suppress fallback. Android work and the Windows prototype can proceed independently after the shared contract is settled.
6. Apply title/preview/visibility/grouping policy consistently to browser notifications and in-app toasts too. Keep optional preview and category controls in settings. Do not use urgent/alarm presentation for ordinary completions. Existing Android channel settings are user-controlled; changing defaults must not silently override established choices.

No gateway DB migration is required for this first phase. Payload additions should remain optional for old clients; keep existing id/title/body/level/link fields working. Native packages need updates for tap routing; a gateway-only release cannot complete this feature. A cross-device completion read inbox, if added later, needs a separate persistence design. Native pending activation/dedupe state can remain local and bounded.

## Acceptance checks

- Tap notification A while viewing chat B: correct project/chat A opens, B's draft survives.
- Repeat for active app, minimized/background app, cold start, delayed login, and offline/reconnect. Consume the target once after readiness rather than lose it during splash/bootstrap.
- Two different chats and multiple completions in one chat: exact targets, useful text, predictable grouped cards; same event arriving over push and WebSocket alerts once.
- Two distinct turns less than 60 seconds apart remain distinct events; dedupe does not drop the second result.
- Visible focused chat does not produce a redundant completion popup; another chat still can.
- Question/approval tap finds its request; existing Android actions still work; resolved elsewhere and expired actions do not act twice. Keep failed submissions recoverable.
- Notification removal works on Android and installed Windows; old cards do not remain actionable after resolution.
- Test installed Windows build and Android APK, including Windows Notification Center and Android notification drawer after app restart. Unit/mock tests alone cannot establish native activation behavior.
- Before implementation claims, identify the source/version of the user's existing Windows alerts; current checked-in bridge does not explain native Windows delivery.

Suggested first delivery: exact-chat taps, clearer titles/previews and completion dedupe/replacement on both platforms. Add new Windows reply/approval buttons and broader per-chat mute/read features after native activation is proven. No user decision is required to finish this investigation; preview privacy and notification-category defaults should be explicit settings during implementation.

## Implementation status (2026-09-21)

Implemented the first delivery in this checkout:

- Shared internal links, completion event IDs and separate per-chat replacement IDs; gateway completion payload is reused for WebSocket and FCM delivery.
- Project/chat context and bounded plain-text completion preview; notification tap uses the existing chat selection and draft state.
- Browser and in-app Open actions; pending native activation waits for authentication/project readiness and survives a failed navigation attempt.
- Android per-card PendingIntent identity, persistent pending navigation, warm-start plugin events, completion dedupe/replacement, focused-chat suppression, and attention tap routing with existing answer actions preserved.
- Windows native toast XML with protocol activation and Open in Jait action, stable replacement/removal tags, installer protocol registration, and startup/single-instance argument delivery.
- Tests for shared-link safety, startup/retry navigation, completion replacement/dedupe, FCM payload preservation, Android pending intents and visibility, and desktop activation serialization.

Validation completed: workspace TypeScript checks; lint; 31 focused TypeScript tests; Android app unit tests and debug APK assembly; 23 desktop Rust tests (one unrelated packaged-runtime test intentionally ignored); JavaScript shim tests; Windows-targeted compilation of the notification module itself. The full Vitest run had 377 passing files and two failing files (a hook timeout and a streaming timing assertion); both failing files passed in an isolated rerun, 96 tests total.

Validation limits: the complete Windows shell cross-build stops in the existing ring dependency because this host's C toolchain lacks stdalign.h. The isolated Windows API check does not prove the complete installer or activation on Windows. Real installed Windows and Android drawer/Notification Center smoke tests remain required. Native package updates are required; gateway-only deployment cannot add native tap handling. No release, publish, or installation on the user's devices was performed.

Deferred beyond this first delivery: new Windows reply/approval buttons, notification preview/category preferences, shared cross-device completion read state, and new Windows background delivery while the app is fully closed.
