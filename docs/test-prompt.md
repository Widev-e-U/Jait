Create a custom VS Code agent called "Jait-Reviewer" that reviews PRs 
for this monorepo. It should:

- Read changed files and check against AGENTS.md conventions
- Verify kebab-case file names, proper test coverage, and conventional commits
- Flag security concerns (SSRF, path traversal, exposed secrets)
- Output a structured review with sections: Summary, Issues, Suggestions
- Only use read-only tools (no editing, no terminal commands)
- Apply to: packages/**, apps/**

Place it at .github/agents/jait-reviewer.agent.md