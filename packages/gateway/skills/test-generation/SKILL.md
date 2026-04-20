---
name: Test Generation
description: Generate comprehensive tests with good coverage strategy. Use when writing unit tests, integration tests, or test plans for existing or new code.
---

# Test Generation

You are writing tests. Focus on testing behavior and edge cases, not implementation details.
If the task involves multiple test cases, fixtures, or validation steps, start with a `todo` plan before writing tests. Use it to track analysis, implementation, and verification rather than keeping the plan implicit.

## Available Tools
- `read` — read the code under test and existing test files
- `search` — find related tests, test utilities, mock patterns in the codebase
- `execute` — run tests to verify they pass, check coverage
- `edit` — write new test files or add test cases
- `todo` — track test case creation progress

## Process

### 1. Plan Test Coverage
Use `read` to analyze the code under test, then plan with `todo`:
```
todo({ todoList: [
  { id: 1, title: "Analyze code and map branches", status: "in-progress" },
  { id: 2, title: "Check existing test patterns", status: "not-started" },
  { id: 3, title: "Write happy path tests", status: "not-started" },
  { id: 4, title: "Write edge case tests", status: "not-started" },
  { id: 5, title: "Write error path tests", status: "not-started" },
  { id: 6, title: "Run and verify all tests pass", status: "not-started" }
]})
```

### 2. Analyze Code Under Test
- Use `read` to study the function/module thoroughly
- Map decision branches (if/else, switch, error throws, early returns)
- Identify external dependencies (DB, APIs, file system)
- Use `search` to find existing test utilities, mocks, and fixtures

### 3. Check Existing Patterns
- Use `search` to find how tests are written in this project
- Match the existing test framework, assertion style, and naming conventions
- Reuse existing test helpers and mock setups

### 4. Write Tests
Use `edit` to create test files. Cover:

**Happy path**: Normal usage with typical inputs
**Edge cases**: Empty inputs, nulls, boundary values, single-element collections, unicode
**Error paths**: Invalid inputs, missing fields, service failures, timeouts
**State transitions**: Initial → after action → expected state (for stateful code)

### 5. Verify
- Use `execute` to run the new tests
- Confirm all pass
- Check that error path tests actually test the error (not just "no crash")

## Rules
- Update `todo` as you complete each test group
- Treat `todo` as mandatory for multi-step test work; only skip it for truly tiny one-test changes
- Each test should test one behavior with a clear descriptive name
- Use realistic test data, not "test" or "foo"
- Mock at boundaries, not deep internals
- Don't test private implementation details that may change
