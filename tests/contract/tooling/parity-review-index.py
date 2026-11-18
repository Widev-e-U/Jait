#!/usr/bin/env python3
"""Join generated Rust translation cases with the saved coverage inventory.

This is an inventory/join step only. It reports which translated declarations
exist, which are still pending, and what matcher rules each Rust case asserts.
It produces no parity claim on its own.
"""

import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
CASES = os.path.join(ROOT, "tests", "contract", "tests", "tail_static.rs")
MANIFEST = os.path.join(ROOT, "tests", "contract", "coverage.json")
OUT = os.path.join(ROOT, ".jait", "artifacts", "parity-review", "index.json")

CASE_RE = re.compile(
    r"// (?P<original>[^\n]+): (?P<name>[^\n]*)\n"
    r"(?P<attrs>(?:#\[[^\]]*\]\n)*)"
    r"fn (?P<fn>tailstatic_[a-z0-9_]+)\(\) \{\n"
    r"\s*tail_assertions::check\(\n"
    r'\s*(?:(?P<group>\d+)|r(?P<group_hashes>#+)"(?P<group_key>[a-z0-9][a-z0-9-]*)"(?P=group_hashes)),\n'
    r'\s*r(?P<id_hashes>#+)"(?P<id>.*?)"(?P=id_hashes),\n'
    r'\s*r(?P<rules_hashes>#+)"(?P<rules>.*?)"(?P=rules_hashes),\n'
    r"\s*\);\n\}",
    re.S,
)


DISPATCH_RE = re.compile(
    r'''^\s*case (?P<key>\d+|"[a-z0-9-]+"): return await \(await import\((?P<quote>['"])(?P<module>[^'"]+)(?P=quote)\)\)\.run\(call\.name\);$''',
    re.M,
)


def dispatcher_peers(source):
    peers = {}
    matches = list(DISPATCH_RE.finditer(source))
    if len(matches) != len(re.findall(r"^\s*case\s+", source, re.M)):
        raise ValueError("unsupported fixture dispatcher registration")
    for match in matches:
        key = json.loads(match.group("key"))
        module = match.group("module")
        if not re.fullmatch(r"\./tailstatic/fixture(?:[0-9]+|-[a-z0-9-]+)\.ts", module):
            raise ValueError("fixture dispatcher escapes generated fixture directory")
        if key in peers:
            raise ValueError("duplicate fixture dispatcher key")
        peers[key] = "tests/contract/drivers/" + module[2:]
    return peers


def load_cases(source=None, dispatcher_source=None):
    text = open(CASES, encoding="utf-8").read() if source is None else source
    if source is None and dispatcher_source is None:
        dispatcher_source = open(os.path.join(ROOT, "tests/contract/drivers/tailstatic.ts"), encoding="utf-8").read()
    peers = dispatcher_peers(dispatcher_source) if dispatcher_source is not None else None
    cases = {}
    for match in CASE_RE.finditer(text):
        rules = json.loads(match.group("rules"))
        case_id = match.group("id")
        if case_id in cases:
            raise ValueError("duplicate Rust case id: " + case_id)
        group = int(match.group("group")) if match.group("group") is not None else match.group("group_key")
        if peers is not None and group not in peers:
            raise ValueError("Rust case has no fixture dispatcher registration: " + str(group))
        peer_source = peers[group] if peers is not None else (
            "tests/contract/drivers/tailstatic/fixture" + (str(group) if isinstance(group, int) else "-" + group) + ".ts"
        )
        cases[case_id] = {
            "id": case_id,
            "function": match.group("fn"),
            "group": group,
            "peer_source": peer_source,
            "original": match.group("original"),
            "name": match.group("name"),
            "ignored": "#[ignore" in match.group("attrs"),
            "matchers": [rule.get("matcher") for rule in rules],
            "negated": [bool(rule.get("negate")) for rule in rules],
            "rule_count": len(rules),
            "rules": rules,
        }
    return text, cases


def case_id_for(declaration_id):
    head, line, column = declaration_id.rsplit(":", 2)
    slug = re.sub(r"[^a-zA-Z0-9]", "_", head)
    return "tailstatic_%s_%s_%s" % (slug, line, column)


def translated_variants(declaration_id, cases):
    """Return generated registrations, without claiming variant completeness."""
    case_id = case_id_for(declaration_id)
    suffix = re.compile(r"^(?:_(?:for\d+|each\d+|runtime|branch))+$")
    return [
        case
        for key, case in cases.items()
        if key == case_id
        or (key.startswith(case_id) and suffix.fullmatch(key[len(case_id):]))
    ]


def main():
    text, cases = load_cases()
    total_functions = len(re.findall(r"^fn tailstatic", text, re.M))
    if len(cases) != total_functions:
        raise ValueError("not every generated Rust registration was indexed")
    manifest = json.load(open(MANIFEST, encoding="utf-8"))

    rows = []
    unmatched = []
    for group in ("test_files", "source_files", "retained_test_files"):
        for entry in manifest.get(group, []):
            for case in entry.get("cases") or []:
                declaration = case["id"]
                case_id = case_id_for(declaration)
                translated = cases.get(case_id)
                variants = translated_variants(declaration, cases)
                row = {
                    "declaration": declaration,
                    "case": case_id,
                    "status": case.get("status"),
                    "parameterized": bool(case.get("parameterized")),
                    "boundary": case.get("boundary"),
                    "suite": case.get("suite") or [],
                    "name": case.get("name"),
                    "translated": translated is not None,
                    "translation_variants": [
                        {"case": v["id"], "ignored": v["ignored"]} for v in variants
                    ],
                    "ignored": bool(translated and translated["ignored"]),
                    "rule_count": translated["rule_count"] if translated else 0,
                    "matchers": translated["matchers"] if translated else [],
                    "group": translated["group"] if translated else None,
                }
                rows.append(row)
                if not variants and row["status"] == "pending":
                    unmatched.append(declaration)

    pending = [r for r in rows if r["status"] == "pending"]
    translated_pending = [r for r in pending if r["translated"] and not r["ignored"]]
    summary = {
        "rust_cases_in_file": total_functions,
        "rust_cases_indexed": len(cases),
        "declarations": len(rows),
        "pending": len(pending),
        "pending_with_executable_rust_case": len(translated_pending),
        "pending_ignored_rust_case": len([r for r in pending if r["translated"] and r["ignored"]]),
        "pending_with_generated_variants": len([
            r for r in pending if r["translation_variants"]
        ]),
        "pending_with_ignored_variant": len([
            r for r in pending
            if any(v["ignored"] for v in r["translation_variants"])
        ]),
        "pending_without_translation": len(unmatched),
        "verified": len([r for r in rows if r["status"] == "verified"]),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "summary": summary,
                "pending_with_executable_rust_case": translated_pending,
                "pending_with_generated_variants": [
                    row for row in pending if row["translation_variants"]
                ],
                "pending_without_translation": unmatched,
                "cases": cases,
            },
            handle,
            indent=1,
            sort_keys=True,
        )
    print(json.dumps(summary, indent=1))
    print(OUT)


if __name__ == "__main__":
    sys.exit(main())
