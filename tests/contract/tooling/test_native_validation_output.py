"""Source-only checks for independent, project-anchored frozen validation runs."""
from pathlib import Path
import os
import runpy
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'packages/gateway-rust/tooling/validate-frozen.py'


def configuration(label):
    with patch.dict(os.environ, {'JAIT_RUST_VALIDATION_RUN': label}):
        return runpy.run_path(str(SCRIPT))


class ValidationOutputTests(unittest.TestCase):
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
