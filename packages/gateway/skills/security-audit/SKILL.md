---
name: Security Audit
description: Security-focused code analysis covering OWASP Top 10, authentication, authorization, and data protection. Use when auditing code for vulnerabilities, reviewing security-sensitive changes, or hardening an application.
---

# Security Audit

You are performing a security audit. Be systematic and evidence-based.
Security audits are inherently multi-step. Begin with a `todo` plan and maintain it as you move from attack-surface mapping through verification and reporting.

## Available Tools
- `read` — read source files, configs, environment setup, auth logic
- `search` — find input handling, auth checks, SQL queries, shell exec, URL construction
- `execute` — run dependency audits, check for known CVEs, test exploit paths
- `web` — research CVEs, vulnerability databases, library advisories
- `todo` — track audit phases and findings count

## Process

### 1. Plan the Audit
```
todo({ todoList: [
  { id: 1, title: "Map attack surface (entry points)", status: "in-progress" },
  { id: 2, title: "Check injection vectors", status: "not-started" },
  { id: 3, title: "Audit authentication & authorization", status: "not-started" },
  { id: 4, title: "Check secrets & data exposure", status: "not-started" },
  { id: 5, title: "Scan dependencies for CVEs", status: "not-started" },
  { id: 6, title: "Compile findings report", status: "not-started" }
]})
```

### 2. Map Attack Surface
Use `search` to find:
- All HTTP route handlers and WebSocket endpoints
- All `execute`/shell/spawn calls
- All file system operations with user-influenced paths
- All database query construction

### 3. Check Injection Vectors
For each entry point found:
- Use `read` to trace user input from entry to usage
- Use `search` to find if parameterized queries are used consistently
- Check shell commands for unescaped input
- Check file paths for traversal guards (`../`)

### 4. Audit Auth
- Use `search` for auth middleware, JWT validation, session handling
- Use `read` to verify auth is enforced on all sensitive routes
- Check for IDOR (can user A access user B's resources?)
- Verify role checks on admin endpoints

### 5. Check Secrets & Data
- Use `search` for hardcoded API keys, passwords, tokens
- Use `read` on `.gitignore` and env config to verify secrets are excluded
- Check logging for sensitive data leaks

### 6. Scan Dependencies
- Use `execute` to run `npm audit` or equivalent
- Use `web` to check for known CVEs in major dependencies

### 7. Report
For each vulnerability:
- **Severity**: Critical / High / Medium / Low
- **Location**: File path and line number
- **Description**: What the vulnerability is
- **Exploit**: How an attacker could abuse it
- **Fix**: Specific code change

## Rules
- Update `todo` as you complete each audit phase
- Treat `todo` as required for this skill
- Only report real, exploitable issues — not theoretical concerns
- Include a fix suggestion for every finding
- Prioritize by actual risk, not checklist order
