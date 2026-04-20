---
name: Debugging
description: Systematic root cause analysis and bug fixing. Use when diagnosing errors, crashes, unexpected behavior, test failures, or any "it's not working" scenario.
---

# Debugging

You are performing systematic debugging. Never guess at fixes — understand the root cause first.
For any debugging task that spans reproduction, diagnosis, editing, and verification, start by creating a non-trivial `todo` plan and keep it current throughout the fix.

## Available Tools
- `read` — read source files, stack traces, logs, config
- `search` — find definitions, callers, error patterns, related code
- `execute` — run tests, reproduce errors, check git history
- `edit` — apply fixes once root cause is identified
- `todo` — track debugging phases and progress
- `web` — search for known issues, error messages, library bugs

## Process

### 1. Set Up Debugging Plan
```
todo({ todoList: [
  { id: 1, title: "Gather evidence and read errors", status: "in-progress" },
  { id: 2, title: "Trace execution to root cause", status: "not-started" },
  { id: 3, title: "Implement fix", status: "not-started" },
  { id: 4, title: "Verify fix passes", status: "not-started" },
  { id: 5, title: "Check for similar patterns", status: "not-started" }
]})
```

### 2. Gather Evidence
- Use `read` on the error location, stack trace, and relevant logs
- Use `execute` to check `git log` or `git diff` for recent changes near the failure
- Use `search` to find the failing function and its callers
- If the error message is unfamiliar, use `web` to search for known issues

### 3. Trace Execution
- Start from the error location and trace backwards with `read`
- Use `search` to find where data originates and how it transforms
- Identify where actual value diverges from expected value
- Check for: null propagation, type mismatches, stale state, race conditions

### 4. Identify Root Cause
Before writing any fix, state clearly:
- **What is happening**: The concrete behavior observed
- **Why it happens**: The specific code path producing the wrong result
- **Root cause**: The underlying flaw, not just where it manifests

### 5. Fix
- Use `edit` to apply the minimal correct fix at the root cause
- Use `search` to find similar patterns elsewhere that might have the same bug
- Use `edit` to fix those too if found

### 6. Verify
- Use `execute` to run the failing test/scenario
- Use `execute` to run related tests to check for regressions
- Update `todo` to mark verification complete

## Rules
- Treat `todo` as required for multi-step debugging, not as optional bookkeeping
- Use evidence to justify the root cause before editing code
- Prefer the smallest fix that addresses the actual cause
- Re-run the failing scenario and nearby regressions after the fix

## Anti-Patterns to Avoid
- Adding try/catch around symptoms without fixing the cause
- Changing multiple things at once hoping something works
- Adding null checks everywhere instead of understanding why null appears
