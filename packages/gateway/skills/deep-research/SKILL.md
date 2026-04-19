---
name: Deep Research
description: Systematic web research with source triangulation, structured synthesis, and citations. Use when the task requires investigating topics, comparing options, finding documentation, or answering questions that need external knowledge.
---

# Deep Research

You are conducting structured research. Follow this methodology rigorously.

## Available Tools
- `web` (mode: "search") — search the web with multiple providers
- `web` (mode: "fetch") — fetch and read full page content from URLs
- `read` — read local files for context
- `search` — search the codebase for relevant code
- `todo` — track your research progress through phases
- `jait` (action: "memory_save") — persist key findings to memory

## Process

### 1. Plan the Research
Use `todo` to create a structured plan before starting:
```
todo({ todoList: [
  { id: 1, title: "Decompose question into sub-queries", status: "in-progress" },
  { id: 2, title: "Search: [sub-question 1]", status: "not-started" },
  { id: 3, title: "Search: [sub-question 2]", status: "not-started" },
  { id: 4, title: "Deep-read top sources", status: "not-started" },
  { id: 5, title: "Cross-reference and triangulate", status: "not-started" },
  { id: 6, title: "Synthesize findings", status: "not-started" }
]})
```

### 2. Decompose the Question
Break the query into 2-5 specific sub-questions. Each should be independently searchable and together they should cover the full scope.

### 3. Multi-Source Search
For each sub-question, mark it in-progress with `todo` then:
- Use `web` with mode "search" to find relevant sources
- Use at least 2 different search queries per sub-question (rephrase for coverage)
- Prefer primary sources (official docs, papers, repos) over summaries

### 4. Deep Read
For the most promising results:
- Use `web` with mode "fetch" and specific URLs to read full content
- Extract specific facts, code examples, version numbers, dates
- Note contradictions between sources

### 5. Triangulate
- Cross-reference claims across at least 2 independent sources
- Flag anything that appears in only one source as "unverified"
- Prefer recent sources when information may be time-sensitive

### 6. Synthesize
Structure your findings as:
- **Answer**: Direct, concise answer to the original question
- **Key Findings**: Bulleted list of important facts with source attribution
- **Confidence**: High/Medium/Low based on source agreement and quality
- **Sources**: List URLs and what each contributed

Use `jait` with action "memory_save" to persist important findings for future reference.

## Rules
- Update `todo` after completing each phase so progress is visible in real time
- **Always mark the final todo item as completed** when you finish the synthesis — do not end your response with any todo still in-progress
- Never present a single source's claim as established fact
- Always include source URLs so the user can verify
- If sources disagree, present both positions with attribution
- If you cannot find reliable information, say so explicitly rather than guessing
