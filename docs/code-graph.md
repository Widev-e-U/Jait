# Repository Code Graph

Jait can build a local structural knowledge graph for any local project and expose it in the project Architecture workspace and to agents.

## Runtime setup

Graphify is a required Jait runtime dependency. A normal `@jait/gateway` install provisions the pinned `graphifyy` release in an isolated virtual environment under `~/.jait/runtime/graphify/`. Gateway startup validates the runtime and installs or upgrades it automatically when needed.

The host must provide Python 3.10 or newer with `venv` and `pip`. Run `jait doctor` to diagnose provisioning failures.

Set `JAIT_GRAPHIFY_COMMAND` to use a validated external Graphify executable instead. Set `JAIT_GRAPHIFY_PYTHON` when Jait should create the managed environment with a non-default Python executable.

Remote-node projects are intentionally rejected by the gateway routes until graph execution is routed to the owning node.

## Architecture workspace

Open a project's Architecture tab and choose:

- **Overview** for the existing Mermaid architecture diagram.
- **Code Graph** to index, filter, navigate, and inspect Graphify symbols and typed relationships.
- **Query** to retrieve a compact multi-hop subgraph with file and line provenance.

The graph is stored under `~/.jait/data/code-graphs/` and its status, source revision, Graphify version, statistics, and GraphRAG stage are tracked in SQLite.

## Agent tools

The gateway registers these native tools:

- `codegraph.index`
- `codegraph.query`
- `codegraph.path`
- `codegraph.prepare_graphrag`
- `codegraph.status`

## GraphRAG stage

Graphify remains the canonical structural graph. The optional second stage exports stable GraphRAG-shaped entity, relationship, and text-unit JSONL datasets plus a manifest beside the graph cache.

This boundary keeps the Jait gateway lightweight and makes the external GraphRAG indexing/query runtime replaceable. The current integration prepares and tracks those datasets; it does not bundle Python, embeddings, an LLM, or the Microsoft GraphRAG CLI. A future runtime adapter can convert the staged datasets to GraphRAG's Parquet artifacts and execute global/local/DRIFT queries without changing the Graphify ingestion or UI contracts.
