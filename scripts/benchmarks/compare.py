"""Run a fixed Terminal-Bench subset through Jait and Harbor's baseline adapters."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import random
import secrets
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
ARTIFACTS = ROOT / ".jait/artifacts/benchmarks"
MODEL = "deepseek-v4.1-flash:cloud"
DATASET = ARTIFACTS / "datasets/terminal-bench"
UPSTREAM = "http://127.0.0.1:11434"
OPEN = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def task_subset(count):
    # The manifest is selected before model runs, without reading solutions/tests.
    candidates = sorted(p for p in DATASET.iterdir() if (p / "task.toml").exists())
    import tomllib
    eligible = []
    for p in candidates:
        config = tomllib.loads((p / "task.toml").read_text())
        environment = config.get("environment", {})
        if environment.get("gpus", 0) or environment.get("gpu_types") or environment.get("os", "linux") != "linux":
            continue
        eligible.append(p)
    random.Random(20261027).shuffle(eligible)
    if count > len(eligible):
        raise ValueError("Not enough eligible tasks")
    return eligible[:count]


class Relay(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    model = MODEL
    records = None
    api_key = None
    lock = threading.Lock()

    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(210)

    def do_POST(self):
        if self.api_key and self.headers.get("Authorization") != "Bearer " + self.api_key:
            self.send_error(401)
            return
        parts = self.path.split("/", 2)
        agent = parts[1] if len(parts) > 2 else "unknown"
        endpoint = "/" + parts[2] if len(parts) > 2 else self.path
        if agent not in ["jait", "mini-swe-agent", "openhands"] or endpoint not in ["/v1/chat/completions", "/api/chat"]:
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400)
            return
        if not 0 < length <= 16_000_000:
            self.send_error(413)
            return
        try:
            body = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            self.send_error(400)
            return
        if not isinstance(body, dict):
            self.send_error(400)
            return
        if body.get("model") != self.model:
            self.send_error(400, "Benchmark model mismatch")
            return
        # Identical sampling and generation limits across every harness.
        if endpoint.startswith("/v1/"):
            body["temperature"] = 0
            body.pop("max_completion_tokens", None)
            body["max_tokens"] = 16384
            if body.get("stream"):
                body["stream_options"] = {"include_usage": True}
            body["reasoning_effort"] = "high"
        else:
            body.setdefault("options", {}).update(temperature=0, num_predict=16384)
            body["think"] = True
        started = time.monotonic()
        record = {"time": datetime.now(timezone.utc).isoformat(), "model": body["model"],
                  "agent": agent, "stream": body.get("stream", False), "temperature": 0,
                  "max_output_tokens": 16384}
        request = urllib.request.Request(UPSTREAM + endpoint,
            data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        captured = bytearray()
        try:
            with OPEN.open(request, timeout=180) as response:
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Connection", "close")
                self.end_headers()
                while chunk := response.read1(65536):
                    self.wfile.write(chunk)
                    if len(captured) < 4_000_000:
                        captured.extend(chunk)
                self.wfile.flush()
            record["status"] = 200
            if body.get("stream"):
                for line in captured.decode(errors="replace").splitlines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        try:
                            message = json.loads(line[6:])
                            if message.get("usage"): record["usage"] = message["usage"]
                            if message.get("model"): record["reported_model"] = message["model"]
                        except ValueError:
                            pass
            else:
                message = json.loads(captured)
                record["usage"] = message.get("usage")
                record["reported_model"] = message.get("model")
        except (OSError, ValueError) as error:
            record["error"] = type(error).__name__
            if isinstance(error, urllib.error.HTTPError):
                record["upstream_status"] = error.code
            if not captured:
                try: self.send_error(502, "Ollama request failed")
                except OSError: pass
        finally:
            self.close_connection = True
            record["duration_seconds"] = round(time.monotonic() - started, 3)
            with self.lock:
                with self.records.open("a") as output:
                    output.write(json.dumps(record) + "\n")


async def run(args):
    from harbor.job import Job
    from harbor.models.job.config import JobConfig
    loop = asyncio.get_running_loop()
    active = asyncio.current_task()
    loop.add_signal_handler(signal.SIGTERM, active.cancel)
    selected = task_subset(args.tasks)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = ARTIFACTS / "runs" / (args.label + "-" + stamp)
    output.mkdir(parents=True)
    manifest = {
        "benchmark": "terminal-bench/terminal-bench@4.0.0", "model": MODEL,
        "selection_seed": 20261027, "selection_exclusions": ["GPU requirements", "non-Linux"],
        "tasks": [{"name": p.name, "task_sha256": hashlib.sha256((p / "task.toml").read_bytes()).hexdigest(),
                   "instruction_sha256": hashlib.sha256((p / "instruction.md").read_bytes()).hexdigest()}
                  for p in selected],
        "attempts": args.repeat, "agents": args.agents, "task_timeout_seconds": 900,
        "temperature": 0, "max_output_tokens_per_request": 16384, "reasoning_effort": "high",
        "harbor_version": __import__("importlib.metadata").metadata.version("harbor"),
        "git_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "checkout_dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT)),
        "jait_runtime_sha256": hashlib.sha256((ARTIFACTS / "jait-runtime.tar.gz").read_bytes()).hexdigest(),
        "limitations": ["15 minute pilot budget differs from official leaderboard",
                       "Harness-specific prompts and tool sets are retained",
                       "Ollama usage may not provide monetary cost",
                       "Harbor mini-swe-agent setup includes missing mcp==2.3.0 dependency",
                       "Harbor legacy OpenHands adapter uses openhands-ai 0.62.0 on Python 3.12"],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    bridge = json.loads(subprocess.check_output(["docker", "network", "inspect", "bridge"]))
    address = bridge[0]["IPAM"]["Config"][0]["Gateway"]
    Relay.records = output / "model-requests.jsonl"
    Relay.api_key = secrets.token_urlsafe(32)
    relay = ThreadingHTTPServer((address, 0), Relay)
    relay.daemon_threads = True
    thread = threading.Thread(target=relay.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://{address}:{relay.server_port}"
    os.environ.update(JAIT_BENCH_BASE_URL=base_url + "/jait/v1", JAIT_BENCH_MODEL=MODEL,
                      JAIT_BENCH_API_KEY=Relay.api_key, OPENAI_API_KEY=Relay.api_key, OPENAI_API_BASE=base_url + "/jait/v1")
    agents = []
    for name in args.agents:
        config = {"model_name": "openai/" + MODEL, "override_timeout_sec": 900,
                  "override_setup_timeout_sec": 900, "base_url": base_url + "/" + name + "/v1",
                  "env": {"OPENAI_API_KEY": "${OPENAI_API_KEY}", "OPENAI_API_BASE": base_url + "/" + name + "/v1"}}
        if name == "jait":
            config.pop("base_url")
            config["import_path"] = "scripts.benchmarks.jait_harbor:JaitAgent"
            config["model_name"] = MODEL
        else:
            if name == "mini-swe-agent":
                config["import_path"] = "scripts.benchmarks.baselines:MiniSweAgentWithDependencies"
            else:
                config["name"] = name
            config["kwargs"] = {"reasoning_effort": "high"}
            if name == "openhands":
                config["kwargs"].update(version="0.62.0", python_version="3.12")
        agents.append(config)
    config = JobConfig.model_validate({
        "job_name": "comparison", "jobs_dir": str(output), "n_attempts": args.repeat,
        "n_concurrent_trials": 1, "retry": {"max_retries": 0},
        "environment": {"type": "docker", "delete": True, "kwargs": {"auto_mounting": False}},
        "extra_instructions": ["This comparison pilot limits execution to 900 seconds per task. Complete implementation and verification within that budget."],
        "agents": agents, "datasets": [{"path": str(DATASET), "task_names": [p.name for p in selected]}],
    })
    (output / "config.json").write_text(config.model_dump_json(indent=2))
    print("RUN_DIRECTORY=" + str(output), flush=True)
    try:
        job = await Job.create(config)
        results = await job.run()
        (output / "result.json").write_text(results.model_dump_json(indent=2))
        from scripts.benchmarks.summarize import summarize
        print("REPORT=" + str(summarize(output)), flush=True)
        print("RESULT=" + str(output / "result.json"), flush=True)
        if results.stats.n_errored_trials:
            raise RuntimeError(f"{results.stats.n_errored_trials} trial(s) had infrastructure or agent errors; see report")
    finally:
        relay.shutdown()
        relay.server_close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks", type=int, default=20)
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--agents", nargs="+", choices=["jait", "mini-swe-agent", "openhands"],
                        default=["jait", "mini-swe-agent", "openhands"])
    parser.add_argument("--label", default="deepseek-pilot")
    args = parser.parse_args()
    if not 1 <= args.tasks <= 66 or not 1 <= args.repeat <= 3:
        parser.error("Tasks 1..66 and repeats 1..3 required")
    # Harbor subprocess/cache output must stay in this checkout.
    (ARTIFACTS / "tmp").mkdir(parents=True, exist_ok=True)
    os.environ.update(TMPDIR=str(ARTIFACTS / "tmp"), XDG_CACHE_HOME=str(ARTIFACTS / "cache"),
                      UV_CACHE_DIR=str(ARTIFACTS / "cache/uv"),
                      DOCKER_CONFIG=str(ARTIFACTS / "docker"))
    import tempfile
    tempfile.tempdir = str(ARTIFACTS / "tmp")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
