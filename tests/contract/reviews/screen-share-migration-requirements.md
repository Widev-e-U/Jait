# Screen-share migration requirements

The existing `gateway_rust_screen_share` differential suite covers the older
HTTP/service interface using media and signaling effect stubs. It does not prove
that a real display is captured or that WebRTC, touch input, or multiple
viewers work. The TypeScript route fingerprint in `native-coverage.json` predates
chat-owned share changes; its historical verified status is not current parity.
Do not refresh that fingerprint or claim migration coverage until new checks
pass against the actual reference and native implementation.

The previously ignored `chat_owned_share_route_validation_and_unknown_sessions`
differential test now runs and passes against the live TypeScript routes. The
suite also checks two chat sessions through joining, approval, handoff and stop,
and checks the advertised input capability against the host's capabilities.
These tests use signaling and media stubs; they do not establish real capture,
control, clipboard, or runtime composition.

Compatibility decisions: shares report `remoteInput` only when the host
advertises it; desktop registration probes the native bridge before advertising
computer tools. The chat panel exposes input only when the host reports the
capability and a separate control lease is approved. The Windows desktop control
adapter remains behind its experimental build feature. The native agent share
tool requires an authenticated chat context and host approval; its caller must
use `execute_for_chat` and supply an authorized chat.

With multiple viewers, a host offer or ICE candidate must name its destination;
untargeted messages remain accepted for a single viewer. Viewer signaling goes
only to the host. Legacy WebSocket start requests now refer to an existing share
and viewer, and their chat/consent fields are replaced by the server's state;
only the host may send a WebSocket stop request. Chat-owned starts require
host consent even if a caller claims to be a user, and chat-owned state and
signaling are delivered only to users with access to that chat. Existing REST
join and leave remain the current client path. Migration must include client,
authentication and WebSocket coverage for these intentional changes rather than
silently restoring broadcast or client-provided consent.

The browser media fixture exercises actual WebRTC between a canvas capture and
two viewers, including one viewer leaving. It uses a test signaling server. The
touch-panel fixture exercises relative movement and tap-to-click with mocked
control requests. Neither establishes desktop capture, native input effects,
linked-gateway transport, or Rust runtime composition. The native leave route
currently removes the viewer and broadcasts state, but there is no native
control coordinator to revoke an active viewer lease; that authority and its
failure/cancellation behavior remain mandatory before enabling native control.
The native HTTP routes now check chat and persistent-thread ownership before
reading or mutating chat-owned shares. Differential cases cover another user,
a missing chat, and a thread-owned chat using the native database. Cross-user
WebSocket authorization, native control leases, and actual runtime composition
still need executable parity before chat-owned native sharing is exposed.

Before migration is considered complete, add and pass executable tests for:

- Chat ownership: starting and finding the right chat's live session; separate
  chats and simultaneous sessions; lookup after stop; unauthorized handoff and
  no effects on the other session.
- Consent: agent requests require host approval; rejection and cancellation
  release resources; joining a pending session cannot trigger capture; a viewer
  joining an approved share reuses the capture without prompting again.
- Viewer lifecycle: repeated join is idempotent, a new viewer joins the same
  session, stopped/unknown sessions and invalid devices are rejected, switching
  shares closes old peer resources, unrelated events do not close the current
  connection, and disconnect/reconnect/cleanup work independently.
- Signaling: offer, answer and ICE reach only authorized session participants;
  unknown sessions and nonparticipant senders cannot relay; early ICE is buffered
  per peer and session; all pending signaling is cleared on close. Preserve
  ordering and document any deliberate client-visible change.
- Live media: run an actual host and viewer with a controlled capture source,
  verify decoded frames and teardown, and exercise two simultaneous viewers.
  Include linked-gateway routing, failure, reconnection and bounded cleanup.
- Input: an explicit, active, chat-owned desktop-control consent is required for
  every action; exercise touch-to-pointer mapping through scaling and letterboxing,
  click/drag/scroll, ownership transfer, revocation and disconnect. Test
  supported platforms with real input adapters. Screen-share metadata alone is
  not authority to inject input.
- Security and integration: test authenticated ownership, wrong user/chat/node,
  malformed payloads, concurrent lifecycle actions, cancellation, host loss and
  cleanup, as well as the actual browser panel's attach, retry and stop flows.

The current TypeScript implementation itself lacks or has not been validated for
some of these requirements. For such cases first fix the reference or record an
explicit intentional compatibility decision; do not use passing mocked tests as
proof of real capture, signaling, input or platform support.
