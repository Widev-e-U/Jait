"""Offline checks for isolation, model pinning and honest result aggregation."""
import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


compare = load("compare")
summaries = load("summarize")


class TestComparison(unittest.TestCase):
    def setUp(self):
        self.directory = ROOT / ".jait/artifacts/benchmarks/offline-tests" / uuid.uuid4().hex
        self.directory.mkdir(parents=True)

    def test_fixed_selection_excludes_gpu(self):
        dataset = self.directory / "dataset"
        for name, gpus in [("a", 0), ("b", 0), ("gpu", 1)]:
            task = dataset / name
            task.mkdir(parents=True)
            (task / "task.toml").write_text(f'[environment]\ngpus = {gpus}\n')
        original = compare.DATASET
        try:
            compare.DATASET = dataset
            selected = compare.task_subset(2)
            self.assertEqual({p.name for p in selected}, {"a", "b"})
            self.assertEqual(selected, compare.task_subset(2))
        finally:
            compare.DATASET = original

    def test_errors_are_not_scored_as_success(self):
        directory = self.directory / "comparison"
        for name, reward, exception in [("pass", 1, None), ("fail", 0, None), ("infra", 1, {"type": "SetupError"})]:
            target = directory / name
            target.mkdir(parents=True)
            (target / "result.json").write_text(json.dumps({
                "config": {"agent": {"name": "mini-swe-agent"}},
                "verifier_result": {"rewards": {"reward": reward}},
                "exception_info": exception,
            }))
        report = summaries.summarize(self.directory).read_text()
        self.assertIn("| mini-swe-agent | 3 | 1 | 1 | 1 | 33.3% |", report)

    def test_relay_pins_model_and_sampling_without_forwarding_credentials(self):
        received = []
        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                received.append((self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                data = json.dumps({"model": "deepseek-v4.1-flash", "usage": {"prompt_tokens": 4, "completion_tokens": 2}}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
        class TestRelay(compare.Relay):
            api_key = "private-test"
        TestRelay.records = self.directory / "requests.jsonl"
        relay = ThreadingHTTPServer(("127.0.0.1", 0), TestRelay)
        original = compare.UPSTREAM
        compare.UPSTREAM = f"http://127.0.0.1:{upstream.server_port}"
        for server in [upstream, relay]:
            threading.Thread(target=server.serve_forever, daemon=True).start()
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def send(body, path="/jait/v1/chat/completions"):
            request = urllib.request.Request(f"http://127.0.0.1:{relay.server_port}" + path,
                data=json.dumps(body).encode(), headers={"Authorization": "Bearer private-test"})
            return opener.open(request, timeout=5)
        try:
            request = urllib.request.Request(f"http://127.0.0.1:{relay.server_port}/jait/v1/chat/completions",
                data=json.dumps({"model": compare.MODEL}).encode())
            with self.assertRaises(urllib.error.HTTPError) as unauthenticated:
                opener.open(request, timeout=5)
            self.assertEqual(unauthenticated.exception.code, 401)
            with self.assertRaises(urllib.error.HTTPError) as caught:
                send({"model": "other-model"})
            self.assertEqual(caught.exception.code, 400)
            with self.assertRaises(urllib.error.HTTPError) as caught:
                send({"model": compare.MODEL}, "/jait/arbitrary-path")
            self.assertEqual(caught.exception.code, 404)
            with send({"model": compare.MODEL, "temperature": 2, "max_completion_tokens": 999999}) as response:
                response.read()
            self.assertEqual(len(received), 1)
            auth, request = received[0]
            self.assertIsNone(auth)
            self.assertEqual(request["temperature"], 0)
            self.assertEqual(request["max_tokens"], 16384)
            self.assertNotIn("max_completion_tokens", request)
        finally:
            for server in [relay, upstream]:
                server.shutdown()
                server.server_close()
            compare.UPSTREAM = original


if __name__ == "__main__":
    unittest.main()
