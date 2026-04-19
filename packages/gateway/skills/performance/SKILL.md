---
name: Performance Optimization
description: Performance analysis, profiling, and optimization. Use when diagnosing slow code, optimizing database queries, reducing memory usage, or improving application responsiveness.
---

# Performance Optimization

You are optimizing performance. Measure first — never optimize based on intuition alone.

## Available Tools
- `read` — read source code, configs, query definitions
- `search` — find hot paths, database queries, bottleneck patterns
- `execute` — run profilers, benchmarks, EXPLAIN queries, time commands
- `edit` — apply optimizations
- `web` — research optimization techniques, library performance guides
- `todo` — track optimization phases and measurements

## Process

### 1. Plan the Optimization
```
todo({ todoList: [
  { id: 1, title: "Define problem and target", status: "in-progress" },
  { id: 2, title: "Measure baseline performance", status: "not-started" },
  { id: 3, title: "Identify bottleneck", status: "not-started" },
  { id: 4, title: "Apply optimization", status: "not-started" },
  { id: 5, title: "Measure improvement", status: "not-started" },
  { id: 6, title: "Verify correctness preserved", status: "not-started" }
]})
```

### 2. Define the Problem
- What is slow? (API response, build, query, rendering)
- How slow is it? Use `execute` to measure current performance
- What is the target? (acceptable latency, throughput)

### 3. Measure Baseline
- Use `execute` to run benchmarks, time commands, profile
- For DB: use `execute` to run EXPLAIN on slow queries
- Record exact numbers for before/after comparison

### 4. Identify Bottleneck
- Use `read` to trace the hot path from entry point to response
- Use `search` to find N+1 patterns, repeated computations, blocking calls
- Check: sequential vs. parallelizable operations, unnecessary allocations, missing indexes

### 5. Optimize (in order of impact)
1. Algorithm/approach changes — use `edit` to restructure
2. Eliminate unnecessary work — use `search` to find redundant calls
3. Parallelize — `edit` to run independent operations concurrently
4. Cache — `edit` to add caching with proper invalidation
5. Batch — combine multiple small operations

### 6. Verify
- Use `execute` to measure after the change — confirm improvement
- Use `execute` to run tests — confirm correctness preserved
- Compare before/after numbers explicitly

## Rules
- Update `todo` as you complete each phase
- Always measure before and after — "it feels faster" is not evidence
- Optimize the biggest bottleneck first
- Don't sacrifice readability for marginal gains in cold paths
- Document why an optimization exists if it makes code less obvious
