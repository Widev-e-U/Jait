"""Inventory regression checks; no gateway processes or parity credit."""
import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    "parity_review_index", pathlib.Path(__file__).with_name("parity-review-index.py")
)
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)


class GeneratedVariantInventory(unittest.TestCase):
    def test_raw_string_delimiters_do_not_hide_generated_cases(self):
        for count in (2, 3):
            hashes = "#" * count
            expected = "#" * (count - 1) + " Jait"
            rules = json.dumps([{"matcher": "toContain", "expected": expected}])
            source = (
                "// fixtures/example.test.ts: hashes in expected text\n"
                "#[test]\nfn tailstatic_example() {\n"
                " tail_assertions::check(\n 0,\n r#\"tailstatic_example\"#,\n"
                + " r" + hashes + '"' + rules + '"' + hashes + ",\n );\n}\n"
            )
            _, cases = index.load_cases(source)
            self.assertEqual(cases["tailstatic_example"]["rules"][0]["expected"], expected)

    def test_parameterized_registration_is_found_without_base_registration(self):
        declaration = "packages/gateway/src/service.test.ts:12:3"
        base = index.case_id_for(declaration)
        cases = {
            base + "_for0_each0": {"id": base + "_for0_each0", "ignored": False},
            base + "_for0_each1": {"id": base + "_for0_each1", "ignored": True},
            base + "0_for0": {"id": base + "0_for0", "ignored": False},
            base + "_unknown": {"id": base + "_unknown", "ignored": False},
        }
        variants = index.translated_variants(declaration, cases)
        self.assertEqual(
            [row["id"] for row in variants],
            [base + "_for0_each0", base + "_for0_each1"],
        )
        self.assertEqual([row["ignored"] for row in variants], [False, True])

    def test_base_runtime_and_conditional_registrations_remain_distinct(self):
        declaration = "packages/gateway/src/service.test.ts:12:3"
        base = index.case_id_for(declaration)
        names = [base, base + "_runtime", base + "_branch"]
        cases = {name: {"id": name, "ignored": False} for name in names}
        self.assertEqual(
            [row["id"] for row in index.translated_variants(declaration, cases)],
            names,
        )
        self.assertEqual(
            index.translated_variants(declaration.replace(":12:", ":13:"), cases),
            [],
        )


    def stable_source(self, group='r#"gateway-example-123abc"#'):
        return (
            "// fixtures/example.test.ts: stable fixture\n"
            "#[test]\nfn tailstatic_example() {\n"
            " tail_assertions::check(\n " + group + ",\n"
            ' r#"tailstatic_example"#,\n r#"[]"#,\n );\n}\n'
        )

    def dispatcher(self, key='"gateway-example-123abc"', module='./tailstatic/fixture-gateway-example-123abc.ts'):
        return f"case {key}: return await (await import('{module}')).run(call.name);\n"

    def test_stable_raw_group_keys_and_legacy_numbers_are_preserved(self):
        for hashes in ('#', '##', '###'):
            _, cases = index.load_cases(self.stable_source('r' + hashes + '"gateway-example-123abc"' + hashes))
            self.assertEqual(cases['tailstatic_example']['group'], 'gateway-example-123abc')
        _, legacy = index.load_cases(self.stable_source('27'))
        self.assertEqual(legacy['tailstatic_example']['group'], 27)

    def test_peer_source_comes_from_actual_dispatcher(self):
        dispatcher = self.dispatcher(module='./tailstatic/fixture-renamed-peer-456def.ts')
        _, cases = index.load_cases(self.stable_source(), dispatcher)
        self.assertEqual(cases['tailstatic_example']['peer_source'],
                         'tests/contract/drivers/tailstatic/fixture-renamed-peer-456def.ts')

    def test_missing_dispatcher_registration_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'no fixture dispatcher'):
            index.load_cases(self.stable_source(), self.dispatcher(key='"gateway-other"'))

    def test_dispatcher_path_escape_and_unrecognized_code_are_rejected(self):
        for module in ('../outside.ts', './tailstatic/../../private.ts', '/outside.ts'):
            with self.assertRaisesRegex(ValueError, 'escapes'):
                index.dispatcher_peers(self.dispatcher(module=module))
        with self.assertRaisesRegex(ValueError, 'unsupported'):
            index.dispatcher_peers('case "gateway-example-123abc": return runUnreviewed();\n')

    def test_duplicate_dispatcher_and_rust_ids_are_rejected(self):
        dispatcher = self.dispatcher()
        with self.assertRaisesRegex(ValueError, 'duplicate fixture'):
            index.dispatcher_peers(dispatcher + dispatcher)
        source = self.stable_source()
        with self.assertRaisesRegex(ValueError, 'duplicate Rust case'):
            index.load_cases(source + source.replace('fn tailstatic_example()', 'fn tailstatic_other()'))


if __name__ == "__main__":
    unittest.main()
