# Comparing the native Jait provider with coding harnesses

This opt-in runner uses public Terminal-Bench 4.0 tasks and Harbor 0.25.0.
It runs the native TypeScript Jait gateway through its normal chat API, alongside
Harbor's mini-SWE-agent and OpenHands integrations. Mini-SWE-agent setup adds
the missing `mcp==2.3.0` dependency required by LiteLLM. It does not evaluate the Rust
gateway or an external CLI provider selected inside Jait.

## Setup

From the repository root, with Bun, Python 3.12+, uv, Docker and Docker Compose:

```sh
mkdir -p .jait/artifacts/benchmarks/tmp .jait/artifacts/benchmarks/cache
TMPDIR="$PWD/.jait/artifacts/benchmarks/tmp" UV_CACHE_DIR="$PWD/.jait/artifacts/benchmarks/cache" uv venv .jait/artifacts/benchmarks/venv --python 3.12
TMPDIR="$PWD/.jait/artifacts/benchmarks/tmp" UV_CACHE_DIR="$PWD/.jait/artifacts/benchmarks/cache" uv pip install --python .jait/artifacts/benchmarks/venv/bin/python 'harbor==0.25.0'
TMPDIR="$PWD/.jait/artifacts/benchmarks/tmp" XDG_CACHE_HOME="$PWD/.jait/artifacts/benchmarks/cache" .jait/artifacts/benchmarks/venv/bin/harbor datasets download terminal-bench/terminal-bench@4.0.0 --output-dir .jait/artifacts/benchmarks/datasets
python3 scripts/benchmarks/build.py
```

The current runner uses the existing local Ollama service at 127.0.0.1:11434
with `deepseek-v4.1-flash:cloud`. Ollama must already be authenticated for that
cloud model. Model requests can consume account quota.

The runner uses a project-local Docker configuration at
`.jait/artifacts/benchmarks/docker`. If Compose is not installed globally,
place the official Compose CLI plugin in that directory's
`cli-plugins/docker-compose`, executable. Do not copy personal Docker credentials.
The first local setup used Compose v5.6.1; its version and binary checksum are
saved in `.jait/artifacts/benchmarks/docker-compose-version.json`.

## Run

Check integration with one public task before the full pilot:

```sh
PYTHONDONTWRITEBYTECODE=1 .jait/artifacts/benchmarks/venv/bin/python scripts/benchmarks/test_compare.py
PYTHONDONTWRITEBYTECODE=1 .jait/artifacts/benchmarks/venv/bin/python scripts/benchmarks/compare.py --tasks 1 --repeat 1 --agents jait --label smoke
```

The pilot selects 20 Linux tasks without GPU requirements, using a fixed random
seed before any model runs. Every harness receives exactly the same subset:

```sh
PYTHONDONTWRITEBYTECODE=1 .jait/artifacts/benchmarks/venv/bin/python scripts/benchmarks/compare.py --tasks 20 --repeat 3
```

Runs are sequential to limit model contention. Each agent has 900 seconds per
task and a separate setup budget. The complete pilot can take many hours.
Cancel with Ctrl-C; Harbor owns trial/container cleanup.

The model relay binds only the Docker bridge address, forwards only the fixed
Ollama chat endpoints, requires an ephemeral per-run credential, rejects another model, and does not forward caller
credentials. It requests temperature 0, high reasoning effort and at most 16,384
output tokens per model call. These are requested upstream settings; server
behavior is not independently guaranteed. The relay records returned model names
and token usage when present. It stops when the job finishes.

Jait gets a curated runtime archive, a new gateway database and an evaluation
account in each container. The host checkout and personal Jait state are not
mounted into tasks. Automatic host mounts are disabled; Harbor copies logs back
as the invoking host user. Root installation operates on container-owned storage.
No production provider settings or sessions are changed.

## Results and limits

The command prints its run directory under
`.jait/artifacts/benchmarks/runs/`. It contains a selection manifest, task and
instruction hashes, job configuration, model-request metadata, Harbor results
and per-task Jait traces. Generate a report with:

```sh
PYTHONDONTWRITEBYTECODE=1 .jait/artifacts/benchmarks/venv/bin/python scripts/benchmarks/summarize.py .jait/artifacts/benchmarks/runs/<run>
```

Success comes from Terminal-Bench's verifier, not an LLM judge. Infrastructure
errors remain separate from verifier failures, and success/all includes both
in its denominator. Missing token usage or monetary cost is not treated as zero.

This is an exploratory subset with a 15-minute task budget. It is not an
official Terminal-Bench leaderboard score: the official benchmark has a much
larger timeout. Native system prompts, tools, context management, step limits
and setup behavior differ across harnesses. These differences are part of the
comparison and should accompany any reported result. Hold the underlying model,
task set, resource policy and model-generation settings constant.

References: [Terminal-Bench 4.0](https://www.tbench.ai/news/terminal-bench-4-0),
[Harbor custom agents](https://docs.harborframework.com/agents/custom-agents),
[Harbor integrations](https://docs.harborframework.com/agents/pre-integrated-agents).
