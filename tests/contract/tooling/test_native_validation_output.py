"""Source-only checks for independent, project-anchored frozen validation runs."""
from pathlib import Path
import os
import runpy
import uuid
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'packages/gateway-rust/tooling/validate-frozen.py'


def configuration(label):
    with patch.dict(os.environ, {'JAIT_RUST_VALIDATION_RUN': label}):
        return runpy.run_path(str(SCRIPT))


class ValidationOutputTests(unittest.TestCase):
    def test_changed_snapshot_sources_receive_fresh_mtimes(self):
        config = configuration('source-copy-test')
        directory = ROOT / '.jait/artifacts/native-validation-output-tests' / str(uuid.uuid4())
        directory.mkdir(parents=True)
        source, target = directory / 'source.rs', directory / 'snapshot.rs'
        source.write_text('new source')
        target.write_text('old source')
        os.utime(source, (1, 1))
        os.utime(target, (2, 2))
        copy = config['copy_changed_source']
        copy(source, target, config['digest'](source))
        self.assertEqual(target.read_text(), 'new source')
        self.assertGreater(target.stat().st_mtime_ns, 2_000_000_000)
        before = target.stat().st_mtime_ns
        copy(source, target, config['digest'](source))
        self.assertEqual(target.stat().st_mtime_ns, before)

    def test_generated_artifacts_are_excluded_at_every_depth(self):
        include = configuration('source-filter-test')['is_source_path']
        for path in ['.jait/artifacts/report.json', 'packages/gateway-rust/src/execution/.jait/artifacts/report.json', '.aws/config', 'packages/gateway/.env']:
            with self.subTest(path=path):
                self.assertFalse(include(Path(path)))
        for path in ['packages/gateway-rust/src/execution/session.rs', 'packages/gateway-rust/src/scheduler/scheduler-tzdata-2025b.bin', 'packages/gateway-rust/src/assets/native.json']:
            with self.subTest(path=path):
                self.assertTrue(include(Path(path)))

    def test_default_preserves_the_existing_location(self):
        config = configuration('')
        self.assertEqual(config['OUTPUT'], ROOT / '.jait/artifacts/gateway-rust')
        self.assertEqual(config['SNAPSHOT'], config['OUTPUT'] / 'frozen-source')
        self.assertEqual(config['RUN_OUTPUT'], config['SNAPSHOT'] / '.jait/artifacts')

    def test_independent_run_labels_have_disjoint_snapshots_and_artifacts(self):
        first, second = configuration('core-adapters-174'), configuration('scheduler-175')
        self.assertNotEqual(first['OUTPUT'], second['OUTPUT'])
        self.assertFalse(first['OUTPUT'].is_relative_to(second['OUTPUT']))
        self.assertFalse(second['OUTPUT'].is_relative_to(first['OUTPUT']))
        for config in [first, second]:
            self.assertTrue(config['OUTPUT'].is_relative_to(ROOT / '.jait/artifacts'))
            self.assertEqual(config['SNAPSHOT'], config['OUTPUT'] / 'frozen-source')
            self.assertEqual(config['RUN_OUTPUT'], config['SNAPSHOT'] / '.jait/artifacts')

    def test_path_escape_and_shell_fragments_are_rejected(self):
        for label in ['.', '..', '../escape', '/absolute', 'a/b', r'a\b', '$(id)', 'x;cmd', 'a b', 'a' * 65]:
            with self.subTest(label=label):
                with self.assertRaises(ValueError):
                    configuration(label)

    def test_valid_labels_are_literal_directory_names(self):
        for label in ['a', '0', 'A_B-c', 'a' * 64]:
            with self.subTest(label=label):
                self.assertEqual(configuration(label)['OUTPUT'], ROOT / '.jait/artifacts/gateway-rust/runs' / label)


if __name__ == '__main__':
    unittest.main()
