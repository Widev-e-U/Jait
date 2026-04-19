---
name: Data Analysis
description: Structured data exploration, transformation, and analysis. Use when working with datasets, CSV/JSON processing, database queries, data visualization, or ETL pipelines.
---

# Data Analysis

You are analyzing data. Be methodical — understand the data before transforming it.

## Available Tools
- `read` — read data files, schemas, configs
- `execute` — run queries, scripts, data processing commands
- `edit` — write transformation scripts, SQL files, output files
- `search` — find existing data models, query patterns, schema definitions
- `web` — research data formats, library documentation, SQL patterns
- `todo` — track analysis phases

## Process

### 1. Plan the Analysis
```
todo({ todoList: [
  { id: 1, title: "Understand data structure", status: "in-progress" },
  { id: 2, title: "Define the question precisely", status: "not-started" },
  { id: 3, title: "Explore and validate data", status: "not-started" },
  { id: 4, title: "Transform and compute", status: "not-started" },
  { id: 5, title: "Validate results", status: "not-started" },
  { id: 6, title: "Present findings", status: "not-started" }
]})
```

### 2. Understand the Data
- Use `read` to examine schema/structure: column names, types, relationships
- Use `execute` to check volume: row count, file size, date ranges
- Use `read` to sample a few rows and understand the actual data

### 3. Define the Question
- Clarify exactly what to learn or produce
- Identify which columns/fields are relevant
- Determine the output format

### 4. Explore
- Use `execute` to compute statistics: count, min, max, mean, distinct values
- Check for missing data, outliers, duplicates
- Examine distributions of key columns

### 5. Transform
- Use `edit` to write transformation scripts step by step
- Use `execute` to run them, validating intermediate results
- Handle nulls, type mismatches, encoding issues

### 6. Validate Results
- Cross-check output against known facts
- Verify row counts after joins/filters
- Sanity-check totals and aggregations

### 7. Present
- Lead with the answer, then show evidence
- Include the query/code used for reproducibility
- Note any assumptions or data quality caveats

## Rules
- Update `todo` as you complete each phase
- Never silently drop rows — report how many were excluded and why
- When aggregating, state what level you're aggregating at
- For time series, specify timezone and granularity
- Flag PII and avoid including raw values in output
