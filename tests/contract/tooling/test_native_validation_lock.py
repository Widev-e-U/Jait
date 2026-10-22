"""Validation snapshots must survive concurrent runs and process failures."""
from pathlib import Path
import importlib.util
import subprocess
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[3]
TOOL = ROOT / "packages/gateway-rust/tooling/validate-frozen.py"
spec = importlib.util.spec_from_file_location("native_validation", TOOL)
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


class SnapshotLockTests(unittest.TestCase):
    def setUp(self):
        self.output = ROOT / ".jait/artifacts/gateway-rust/lock-tests" / str(uuid.uuid4())

    def child(self, crash=False):
        script = (
            "import importlib.util, pathlib, sys, os; "
            "s=importlib.util.spec_from_file_location('validation',sys.argv[1]); "
            "m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "
            "lock=m.acquire_run_lock(pathlib.Path(sys.argv[2])); "
            + ("os._exit(0)" if crash else "print('acquired'); lock.close()")
        )
        return subprocess.run(
            [sys.executable, "-c", script, str(TOOL), str(self.output)],
            capture_output=True, text=True, timeout=5,
        )

    def test_concurrent_process_is_refused_until_holder_closes(self):
        with validation.acquire_run_lock(self.output):
            refused = self.child()
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn("snapshot is already in use", refused.stderr)
        accepted = self.child()
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertIn("acquired", accepted.stdout)

    def test_distinct_snapshots_do_not_block_each_other(self):
        with validation.acquire_run_lock(self.output):
            with validation.acquire_run_lock(self.output / "independent"):
                self.assertTrue((self.output / "independent/validation.lock").is_file())

    def test_failed_holder_and_abrupt_process_exit_release_lock(self):
        with self.assertRaisesRegex(ValueError, "fixture failure"):
            with validation.acquire_run_lock(self.output):
                raise ValueError("fixture failure")
        crashed = self.child(crash=True)
        self.assertEqual(crashed.returncode, 0, crashed.stderr)
        with validation.acquire_run_lock(self.output):
            self.assertTrue((self.output / "validation.lock").exists())


if __name__ == "__main__":
    unittest.main()
