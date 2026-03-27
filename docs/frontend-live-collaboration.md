# Frontend Live Collaboration and Mid-Run Intervention

## Goal

Make frontend testing and agent-driven UI work collaborative instead of opaque.

The user should be able to:

- watch what browser session the agent is controlling
- understand whether that session is isolated or shared
- intervene during a run without killing all progress
- perform sensitive actions manually, like logging in or setting a token
- hand control back to the agent and let it continue from the same state

This is especially important for:

- auth flows
- API key and token setup
- CAPTCHA / SSO / MFA
- flaky UI interactions
- long multi-step frontend tests

## Problems Observed

### 1. Browser control was not visible enough to the user

The controlled browser session was not obviously distinct from the user's own Jait frontend, so it was hard to tell:

- what the agent was doing
- where it was doing it
- whether it was touching the user's real instance

### 2. Isolation was not obvious

Even when the agent used isolated ports and a temp home directory, that isolation was not clearly surfaced in the UI.

The system should make it explicit when a browser or preview session is:

- attached to an existing app
- attached to the user's current Jait instance
- running against an isolated test instance

### 3. Browser interaction primitives were too brittle

Several interactions failed because the browser tools did not reliably expose:

- which element was actually clickable
- whether a modal was intercepting pointer events
- stable semantic selectors
- whether a contenteditable region was the active input

### 4. The user could not easily intervene mid-run

There is currently no clean workflow for:

- pausing an active browser-driven task
- asking the user to do one manual step
- resuming the exact same run after that step

That makes real auth and secret-entry flows awkward.

## Desired Workflow

### A. Start a visible browser session

When a frontend task begins, the system should open a browser session that is clearly labeled and visible.

Example metadata shown to both user and agent:

- session name: `isolated-jait-live-test`
- target URL: `http://127.0.0.1:8217`
- browser mode: `isolated`
- preview mode: `attached` or `managed`
- workspace root
- gateway/session ID

The user should be able to watch that session live.

### B. Agent runs until blocked

The agent should operate normally until it hits a step that is better handled by the user, for example:

- login
- SSO
- entering an API key
- solving a CAPTCHA
- approving a wallet / OAuth / device prompt

### C. Agent explicitly requests intervention

The system should support a structured pause with a short handoff message, such as:

`Paused at login form on isolated browser session. Please sign in and press Continue.`

Optional structured intervention types:

- `enter_secret`
- `complete_login`
- `dismiss_modal`
- `choose_option`
- `confirm_external_prompt`

### D. User performs the step in the same session

The user should be able to:

- take control of that browser session
- type or click directly
- optionally annotate what they changed

This avoids asking the agent to handle secrets it should not see.

### E. User resumes the run

Once done, the user should be able to press something like:

- `Continue`
- `Resume agent`
- `Done, continue from here`

The agent should continue in the same browser state, not restart from scratch.

## Required Tooling Improvements

## 1. First-class browser session visibility

Add a clearly visible browser surface the user can watch live.

Possible implementations:

- embedded live browser viewer in Jait
- noVNC-backed browser sandbox link
- screenshot stream
- short screen recording snapshots attached to chat

Minimum requirement:

- the user must be able to tell which exact browser the agent is controlling

## 2. Explicit isolation metadata

Every preview/browser session should expose:

- unique session name
- target URL
- whether it is shared or isolated
- whether it is attached to an existing app or running against a dedicated test instance
- network target summary
- storage profile, for example temp HOME or temp browser profile

This should be visible in both tool output and UI.

## 3. Better interaction primitives

Browser tools should prefer semantic interaction over fragile CSS guesses.

Useful selectors and actions:

- click by role and accessible name
- click by label text
- click by placeholder
- click by dialog title and contained button
- type into active editor / active textbox
- select current tab / selected option

Each snapshot should include suggested stable selectors for interactive elements.

## 4. Better obstruction diagnostics

When an action fails, the tool should report:

- which element was targeted
- which element intercepted the click
- whether a modal/dialog is open
- whether the target was disabled
- whether the element was offscreen

This should replace generic timeout-style failures where possible.

## 5. Pause / resume as a first-class capability

Introduce an execution model where agent runs can be paused intentionally.

Required abilities:

- pause a browser task without tearing down the browser
- persist current agent/browser context
- display a structured intervention request to the user
- resume the same run after user confirmation

This can apply to:

- browser tasks
- preview tasks
- long-running agent threads

## 6. User control handoff

Add explicit control transfer for a browser session:

- `agent controlling`
- `user controlling`
- `shared observation`

While the user has control, the agent should not click/type unless resumed.

## 7. Secret-safe intervention mode

The user should be able to enter secrets without exposing them to logs or model context.

Examples:

- set token in frontend settings
- paste API key
- complete login credentials

The system should support:

- redacted logging
- opt-out from screenshot capture during secret entry
- event-level markers like `user completed secret entry`

## 8. Mid-run notes from the user

The user should be able to send a short instruction while the run is paused, such as:

- `I set the token, continue`
- `Use the staging environment instead`
- `Do not click the destructive button`

That note should be appended to the paused run context before resume.

## Proposed UX

### Session header

Every controlled frontend session should show:

- name
- URL
- isolation status
- current controller: agent or user
- recording status

### Pause card

When the agent needs help, show a card like:

- status: `Paused for user intervention`
- reason: `Login required`
- target session: `isolated-jait-live-test`
- next step: `Please sign in, then click Continue`

Actions:

- `Open live session`
- `Take control`
- `Continue`
- `Cancel run`

### Resume note

When the user clicks continue, allow an optional note:

- `I already set OPENROUTER_API_KEY`
- `You can continue from settings page`

## Proposed API / Tool Shape

These do not need to be the final names, but the capabilities should exist.

### Browser session control

- `browser.session.start`
- `browser.session.get`
- `browser.session.list`
- `browser.session.take_control`
- `browser.session.return_control`
- `browser.session.pause`
- `browser.session.resume`

### Intervention requests

- `agent.intervention.request`
- `agent.intervention.status`
- `agent.intervention.resolve`

Suggested request fields:

- `sessionId`
- `reason`
- `instructions`
- `secretSafe`
- `allowUserNote`
- `resumeBehavior`

### Better inspection

- `browser.inspect` should include:
  - modal stack
  - active element
  - suggested semantic selectors
  - click interception reason
  - selected values for common controls

## Suggested Priority

### Phase 1

- visible isolated browser session
- explicit isolation metadata
- pause / resume support
- user control handoff

### Phase 2

- better semantic selectors
- obstruction diagnostics
- secret-safe intervention mode

### Phase 3

- richer collaborative UX
- timeline / replay of agent and user actions
- resumable long-running frontend task state

## Acceptance Criteria

This work is successful when the following is possible:

1. The agent starts an isolated frontend test session and the user can clearly watch it.
2. The agent reaches a login or token step and pauses intentionally.
3. The user takes control of the same session and completes the sensitive step.
4. The user clicks continue and optionally leaves a short note.
5. The agent resumes from the exact same state and completes the test.
6. The user can clearly verify which app, URL, and environment were touched.

## Why This Matters

This is the difference between:

- opaque automation that the user has to trust blindly

and

- collaborative frontend work where the user and agent can safely share control

For Jait specifically, this would make live debugging, auth setup, test reproduction, and product iteration much more practical.

## Implementation Spec

## Scope

This section turns the design goals above into a concrete implementation plan for Jait.

The intent is to support:

- observable browser automation
- explicit isolation
- structured user intervention
- resumable browser-driven agent work

This should build on existing Jait primitives where possible:

- preview sessions
- browser tools
- WebSocket control plane
- screen-share control transfer
- session state sync
- chat pause / steering infrastructure

## Non-Goals for Phase 1

Phase 1 should not attempt to solve:

- full multi-user collaborative editing of the same browser DOM
- arbitrary rollback of prior browser actions
- OCR / visual replay analysis
- perfect semantic selector generation for every frontend framework

The first milestone is operational reliability and human intervention, not a perfect browser IDE.

## Current Building Blocks to Reuse

The codebase already has pieces that should be reused instead of recreated:

- preview lifecycle in `packages/gateway/src/services/preview.ts` and preview tools/routes
- browser navigation/click/type/snapshot tools
- WebSocket control plane in `packages/gateway/src/ws.ts`
- screen-share control transfer paths
- session and workspace state persistence
- steering / pause-like patterns in chat routes and agent flows

That means the implementation should favor extension over parallel systems.

## Proposed Architecture

### 1. Browser Session Registry

Add a dedicated browser-session model on the gateway side.

Each browser session should track:

- `id`
- `name`
- `workspaceRoot`
- `targetUrl`
- `previewSessionId`
- `browserSurfaceId` or `browserId`
- `mode`: `shared` | `isolated`
- `origin`: `attached` | `managed`
- `controller`: `agent` | `user`
- `status`: `ready` | `running` | `paused` | `intervention-required` | `closed`
- `secretSafe`: boolean
- `storageProfile`: metadata such as temp HOME, temp browser profile, temp DB path
- `createdBy`
- `createdAt`
- `updatedAt`

### 2. Intervention Request Model

Add a durable intervention object linked to a browser session and optionally to an agent run.

Fields:

- `id`
- `browserSessionId`
- `threadId` or `chatSessionId`
- `status`: `open` | `resolved` | `cancelled`
- `reason`
- `kind`: `complete_login` | `enter_secret` | `dismiss_modal` | `confirm_external_prompt` | `custom`
- `instructions`
- `secretSafe`
- `allowUserNote`
- `requestedAt`
- `resolvedAt`
- `resolvedBy`
- `userNote`

### 3. Control Handoff State

Control handoff should be first-class, not inferred.

Allowed states:

- `agent`
- `user`
- `observer`

Rules:

- when controller is `user`, agent-issued click/type/select actions are rejected
- when controller is `agent`, the user can still watch
- when controller is `observer`, neither side is actively mutating state

## Data Persistence

Persist browser sessions and interventions in the gateway DB.

Suggested tables:

- `browser_sessions`
- `browser_interventions`
- optional `browser_session_events`

### `browser_sessions`

Suggested columns:

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `workspace_id TEXT`
- `workspace_root TEXT`
- `target_url TEXT`
- `preview_session_id TEXT`
- `browser_id TEXT`
- `mode TEXT NOT NULL`
- `origin TEXT NOT NULL`
- `controller TEXT NOT NULL`
- `status TEXT NOT NULL`
- `secret_safe INTEGER NOT NULL DEFAULT 0`
- `storage_profile TEXT`
- `created_by TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### `browser_interventions`

Suggested columns:

- `id TEXT PRIMARY KEY`
- `browser_session_id TEXT NOT NULL`
- `thread_id TEXT`
- `chat_session_id TEXT`
- `kind TEXT NOT NULL`
- `reason TEXT NOT NULL`
- `instructions TEXT NOT NULL`
- `status TEXT NOT NULL`
- `secret_safe INTEGER NOT NULL DEFAULT 0`
- `allow_user_note INTEGER NOT NULL DEFAULT 1`
- `user_note TEXT`
- `requested_at TEXT NOT NULL`
- `resolved_at TEXT`
- `resolved_by TEXT`

### `browser_session_events`

Optional but useful for debugging and replay.

Suggested events:

- created
- attached
- navigated
- agent-action
- user-took-control
- agent-took-control
- intervention-requested
- intervention-resolved
- secret-safe-enabled
- secret-safe-disabled
- closed

## Gateway API

## Phase 1 REST endpoints

### Browser session lifecycle

- `POST /api/browser/sessions`
- `GET /api/browser/sessions`
- `GET /api/browser/sessions/:id`
- `POST /api/browser/sessions/:id/take-control`
- `POST /api/browser/sessions/:id/return-control`
- `POST /api/browser/sessions/:id/pause`
- `POST /api/browser/sessions/:id/resume`
- `POST /api/browser/sessions/:id/close`

### Intervention lifecycle

- `POST /api/browser/interventions`
- `GET /api/browser/interventions/:id`
- `POST /api/browser/interventions/:id/resolve`
- `POST /api/browser/interventions/:id/cancel`

### Secret-safe mode

- `POST /api/browser/sessions/:id/secret-safe/start`
- `POST /api/browser/sessions/:id/secret-safe/stop`

## Example request shapes

### Create browser session

```json
{
  "name": "isolated-jait-live-test",
  "workspaceRoot": "/home/jakob/jait",
  "targetUrl": "http://127.0.0.1:8217",
  "mode": "isolated",
  "origin": "attached",
  "storageProfile": {
    "home": "/tmp/jait-live-test-home",
    "port": 8217,
    "wsPort": 19217
  }
}
```

### Request intervention

```json
{
  "browserSessionId": "bs_123",
  "threadId": "thread_123",
  "kind": "enter_secret",
  "reason": "OpenRouter API key required",
  "instructions": "Open settings, paste the API key, then press Continue.",
  "secretSafe": true,
  "allowUserNote": true
}
```

### Resolve intervention

```json
{
  "userNote": "Token set in frontend settings. Continue from current page."
}
```

## WebSocket Events

Use the existing control plane to broadcast browser collaboration state.

Suggested event types:

- `browser.session.created`
- `browser.session.updated`
- `browser.session.controller.changed`
- `browser.session.paused`
- `browser.session.resumed`
- `browser.intervention.requested`
- `browser.intervention.resolved`
- `browser.secret_safe.started`
- `browser.secret_safe.stopped`

These events should drive the frontend UI without polling.

## Tool API Changes

## New tool capabilities

The tool layer should expose collaboration-aware browser actions.

### Browser session control

- `browser.session.start`
- `browser.session.get`
- `browser.session.list`
- `browser.session.pause`
- `browser.session.resume`
- `browser.session.take_control`
- `browser.session.return_control`

### Intervention requests

- `browser.intervention.request`
- `browser.intervention.resolve`

### Secret-safe mode

- `browser.secret_safe.start`
- `browser.secret_safe.stop`

### Improved inspection

Extend `browser.snapshot` or add `browser.inspect` with:

- active element
- open dialogs
- click interception details
- stable suggested selectors
- selected option state for tabs, radios, and selects
- current controller
- whether secret-safe mode is active

## Tool behavior rules

### Control enforcement

If controller is `user`, the following should fail fast with a clear message:

- click
- type
- select
- navigate, unless explicitly forced

Suggested error:

`Browser session is currently controlled by the user. Request control or wait for resume.`

### Secret-safe behavior

When secret-safe mode is on:

- screenshots are disabled or redacted
- DOM snapshots redact form values
- typed content is not logged
- browser events mark only that a secret-safe interaction occurred

### Pause behavior

When paused:

- the browser remains alive
- preview remains attached
- the run context stays associated with the same browser session
- agent actions are suspended until resume

## Frontend UX Spec

## 1. Browser Session Panel

Add a visible panel or drawer that lists active browser sessions.

For each session show:

- session name
- URL
- isolation badge
- attached/managed badge
- controller badge
- status badge
- open/watch button

## 2. Intervention Card

Render intervention requests in chat and optionally in a global sidebar.

Card contents:

- session name
- reason
- instructions
- secret-safe flag
- current controller

Actions:

- `Open session`
- `Take control`
- `Continue`
- `Cancel`

## 3. User Resume UI

On resume, allow a short note.

Fields:

- optional note text
- continue button

That note should be attached to the intervention resolution event and injected into the resumed run context.

## 4. Secret-Safe Indicator

When enabled, show a clear indicator:

- `Secret-safe mode active`

The user should know:

- screenshots are paused or redacted
- the agent will not see typed secret values

## Agent Runtime Integration

## 1. Pause point contract

Agent/browser flows need a standard way to pause without losing intent.

Suggested shape:

- current browser session ID
- current task summary
- last successful step
- reason for pause
- resume instructions

The agent runtime should persist this with the task/thread/session.

## 2. Resume injection

When an intervention is resolved, the runtime should append a structured note before continuing, for example:

`User completed intervention on browser session bs_123. Note: Token set in frontend settings. Continue from current page.`

This avoids re-deriving context from scratch.

## 3. Abort vs pause

Pause must be distinct from abort.

- abort means stop and tear down or unwind
- pause means preserve state and wait

This distinction needs to be explicit in the agent execution model.

## Phase Plan

## Phase 1: Collaborative Browser Sessions

Deliver:

- browser session registry
- visible session metadata
- control handoff
- intervention request and resolve flow
- pause/resume for browser-driven tasks
- minimal frontend UI for session list and intervention cards

Success condition:

- agent can pause at login
- user can take control
- user can resume
- agent continues from the same page/session

## Phase 2: Reliable Interaction and Secret Safety

Deliver:

- semantic selector support
- click obstruction diagnostics
- active-element inspection
- secret-safe mode
- redacted screenshots and snapshots

Success condition:

- auth and token flows can be handled safely without leaking secrets

## Phase 3: Rich Collaboration

Deliver:

- timeline of agent and user actions
- optional replay
- richer session naming and labeling
- multi-session coordination

Success condition:

- frontend debugging becomes auditable and easy to follow

## Risks

## 1. State drift

If the user changes the page significantly during intervention, the agent may resume with stale assumptions.

Mitigation:

- always snapshot on resume
- inject the user note
- encourage resume from visible current state, not cached assumptions

## 2. Secret leakage

Without explicit redaction rules, screenshots or logs could capture sensitive values.

Mitigation:

- secret-safe mode must be explicit
- redact by default during marked secret entry flows

## 3. Tool/UI mismatch

If the tool says a browser session is isolated but the UI does not show that clearly, user trust will remain low.

Mitigation:

- the same metadata should come from one canonical browser-session record used by both API and UI

## Recommended First Implementation Slice

The first practical slice should be:

1. Add browser session records and WS events.
2. Show active browser sessions in the UI with isolation and controller badges.
3. Add intervention request/resolve endpoints and cards.
4. Add control transfer buttons: `Take control` and `Resume agent`.
5. Make browser tools enforce controller ownership.

That is the minimum needed to support the workflow:

- agent starts session
- user watches
- agent pauses
- user performs secret/login step
- user resumes
- agent continues

## Helper Thread Lifecycle Policy

When agents use helper threads to work in parallel, those threads should be treated as temporary execution units, not background daemons.

### Policy

- delegation threads should default to ephemeral behavior
- if a helper thread is no longer needed, it should be stopped promptly
- the parent agent should not leave unused helper threads running at turn end
- if the parent agent proceeds without waiting for a helper result, it must either:
  - explicitly stop the helper as abandoned, or
  - continue waiting and later merge the helper output

### Required Agent Behavior

If an agent creates helper threads, it should:

1. assign each helper a distinct scope
2. avoid duplicating the same work in the parent thread unless the helper is blocked
3. wait for helper completion when the helper output is part of the intended solution
4. stop any helper that is no longer being used
5. verify before final response that every helper thread it created is either:
   - completed
   - intentionally preserved
   - or stopped

### Desired Tool-Level Support

The thread-control layer should support this policy directly.

Recommended additions:

- an `ephemeral` flag for delegation threads
- automatic idle stop for ephemeral helpers after a short TTL
- a warning when the parent agent is about to finish while helper threads are still `running`
- a `create_and_wait` or `run_until_done` mode for helper tasks that should not outlive the parent turn
- explicit `stop_if_unused` semantics so helpers do not linger unintentionally

### Recommended Default

For future agents, the default rule should be:

`Any delegation thread created during a turn must be either consumed or stopped before the final answer, unless the user explicitly asks to keep it running.`
