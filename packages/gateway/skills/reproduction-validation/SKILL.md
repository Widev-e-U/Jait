---
name: Reproduction Validation
description: Prove bug fixes with fail-then-pass validation. Use when debugging regressions, user-reported bugs, flaky behavior, race conditions, UI stream issues, or any fix where the user asks to reproduce the issue first, validate the fix, avoid masking symptoms, or show that the old behavior fails and the new behavior passes.
---

# Reproduction Validation

You are validating a fix by proving the original issue exists, then proving the fix removes it.
Use this skill when confidence depends on a concrete failing reproduction, not just passing nearby tests.

## Core Rule

Do not claim a bug is fixed until you have shown one of these:
- The same deterministic repro fails before the fix and passes after the fix.
- The repro cannot be run before the fix for a concrete reason, and you state that limitation explicitly.

## Process

### 1. Define the Observable Failure
Write down the smallest user-visible or system-visible symptom:
- Wrong rendered text, duplicated events, incorrect HTTP response, crashed process, stale state, lost data, etc.
- Prefer an assertion over a screenshot-only observation.
- Include the exact expected and actual values when possible.

### 2. Build a Deterministic Repro
Create the narrowest repro that exercises the real failing path:
- Prefer existing test frameworks in the repo.
- Use unit tests for pure logic.
- Use integration tests for services, persistence, routing, or process boundaries.
- Use browser/e2e tests for UI lifecycle, rendering, stream reconnects, focus/page events, and user interaction.
- Mock only external dependencies that are not the behavior under test.
- Keep the real code path under test intact.

For race or lifecycle bugs, simulate the actual trigger sequence:
- Open/close/reopen
- focus, pageshow, visibilitychange, online/offline
- duplicate network events
- delayed promises or streams
- cancellation and reconnect

### 3. Confirm the Repro Fails Before the Fix
Before applying or finalizing the fix, prove the repro catches the issue:
- Run the repro against the current broken code, or temporarily disable/revert only the suspected fix.
- Capture the failing assertion in the work log.
- Make sure the failure matches the original symptom, not a test setup error.

If temporarily disabling a fix:
- Keep the edit surgical and reversible.
- Restore the fix immediately after the failing run.
- Do not leave the worktree in the intentionally broken state.

### 4. Apply the Root Fix
Fix the cause that allowed the repro to fail.
Avoid adding only a downstream guard unless the upstream behavior is inherently uncontrollable.
If adding a defensive guard, also fix or explicitly justify the upstream ownership/lifecycle boundary.

### 5. Confirm the Same Repro Passes After the Fix
Run the exact same repro again without changing the assertion.
Then run nearby regression tests that cover adjacent behavior.

### 6. Report Evidence
In the final response, include:
- The repro file or command.
- The before-fix failure summary, including the mismatched expected/actual value.
- The after-fix pass result.
- Any remaining limitation or reason the repro is partial.

## Good Validation Patterns

- Browser lifecycle bug:
  - Add a page that uses the real hook/component.
  - Mock the network stream.
  - Fire the real browser events.
  - Assert the stream or rendered output count.
  - Temporarily disable the lifecycle gate to prove the test fails.

- API regression:
  - Add a route/service test that sends the problematic request.
  - Assert the exact status/body before and after.

- Parser/state bug:
  - Add a unit test with the minimal input that produces the bad output.
  - Assert the exact output.

## Anti-Patterns

- Only running broad tests after a fix.
- Writing a test that only passes on the fixed code without proving it would have failed.
- Mocking away the component, hook, route, or state machine that caused the bug.
- Calling a defensive dedupe a root fix when duplicate ownership is still allowed.
- Leaving a temporary revert, disabled guard, or debug-only assertion in the final code.
