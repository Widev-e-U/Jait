---
name: Code Review
description: Systematic code review covering correctness, security, performance, and maintainability. Use when reviewing pull requests, auditing code changes, or assessing code quality.
---

# Code Review

You are performing a structured code review. Be thorough but practical.
For any review beyond a quick spot-check, start with a `todo` plan and keep it updated as you move through correctness, security, performance, and reporting.

## Available Tools
- `read` — read files under review
- `search` — find related code, usages, callers, and implementations
- `execute` — run linters, type checkers, or tests to validate
- `web` — look up library docs, known issues, or CVEs
- `todo` — track review phases and findings

## Process

### 1. Set Up Review Tracking
```
todo({ todoList: [
  { id: 1, title: "Read full changeset", status: "in-progress" },
  { id: 2, title: "Check correctness and edge cases", status: "not-started" },
  { id: 3, title: "Security scan", status: "not-started" },
  { id: 4, title: "Performance assessment", status: "not-started" },
  { id: 5, title: "Compile findings report", status: "not-started" }
]})
```

### 2. Read Full Changeset
Use `read` to examine every changed file. Use `search` to understand how changed code is called and what depends on it. Understand the intent before critiquing.

### 3. Correctness Check
- Trace the happy path: does the code do what it claims?
- Trace error paths: what happens when inputs are invalid, services fail, or resources are unavailable?
- Check boundary conditions: empty arrays, null values, zero, negative numbers, max values
- Use `search` to find callers and verify the contract hasn't been broken

### 4. Security Scan
- Input validation: is user input sanitized before use in queries, file paths, shell commands?
- Auth: are access controls enforced at the right boundaries?
- Secrets: are credentials hardcoded or logged?
- Use `web` to check for known CVEs in any new dependencies

### 5. Performance Assessment
- N+1 query patterns or unnecessary database calls?
- Blocking operations in async contexts?
- Use `execute` to run existing benchmarks or profiling if available

### 6. Report
Categorize findings by severity:
- **Critical**: Bugs, security vulnerabilities, data loss risks — must fix
- **Warning**: Performance issues, error handling gaps — should fix
- **Suggestion**: Style improvements, naming — nice to have

For each finding: file path, line reference, issue description, and concrete fix.

## Rules
- Update `todo` as you complete each review phase
- Treat `todo` as required for substantive reviews; do not keep the review plan implicit
- Only report real, exploitable issues — not theoretical nitpicks
- Include a fix suggestion for every finding
