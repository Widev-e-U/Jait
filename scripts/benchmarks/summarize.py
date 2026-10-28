"""Summarize completed Harbor trials, keeping runtime errors separate."""
import argparse
from collections import defaultdict
from datetime import datetime
import json
from pathlib import Path
from statistics import median


def summarize(directory: Path):
    groups = defaultdict(list)
    for file in sorted((directory / "comparison").glob("*/result.json")):
        trial = json.loads(file.read_text())
        config = trial.get("config", {}).get("agent", {})
        name = (trial.get("agent_info") or {}).get("name") or config.get("name")
        if not name:
            imported = config.get("import_path") or ""
            name = "jait" if "jait_harbor" in imported else "mini-swe-agent" if "MiniSweAgent" in imported else "unknown"
        groups[name].append(trial)
    lines = ["# DeepSeek v4.1 Flash coding harness comparison", "",
             "Exploratory Terminal-Bench 4.0 subset; 900 seconds per task. Not an official leaderboard score.", "",
             "| Harness | Trials | Passed | Failed | Errors | Success/all |",
             "| --- | ---: | ---: | ---: | ---: | ---: |"]
    timings = []
    for name, trials in sorted(groups.items()):
        passed = failed = errors = 0
        durations, versions = [], set()
        for trial in trials:
            if trial.get("exception_info"):
                errors += 1
            elif (trial.get("verifier_result") or {}).get("rewards", {}).get("reward") == 1:
                passed += 1
            else:
                failed += 1
            timing = trial.get("agent_execution") or {}
            if timing.get("started_at") and timing.get("finished_at"):
                durations.append((datetime.fromisoformat(timing["finished_at"]) -
                                  datetime.fromisoformat(timing["started_at"])).total_seconds())
            version = (trial.get("agent_info") or {}).get("version")
            if version:
                versions.add(version)
        lines.append(f"| {name} | {len(trials)} | {passed} | {failed} | {errors} | {passed / len(trials):.1%} |")
        if durations:
            timings.append(f"- {name}: median execution {median(durations):.1f}s across {len(durations)} timed trials; versions {', '.join(sorted(versions)) or 'unknown'}.")
    if not groups:
        lines += ["", "No completed trials yet."]
    if timings:
        lines += ["", "Execution time excludes environment and harness installation:", ""] + timings
    requests = directory / "model-requests.jsonl"
    if requests.exists():
        usage = defaultdict(lambda: {"requests": 0, "input": 0, "cached": 0, "output": 0, "usage_records": 0})
        for line in requests.read_text().splitlines():
            try: record = json.loads(line)
            except ValueError: continue
            total = usage[record.get("agent", "all")]
            total["requests"] += 1
            if record.get("usage"):
                total["usage_records"] += 1
                total["input"] += record["usage"].get("prompt_tokens", 0)
                total["cached"] += (record["usage"].get("prompt_tokens_details") or {}).get("cached_tokens", 0)
                total["output"] += record["usage"].get("completion_tokens", 0)
        lines += ["", "Model endpoint usage (input includes cached tokens; monetary cost is unknown):", ""]
        for name, counts in sorted(usage.items()):
            lines.append(f"- {name}: {counts['requests']} requests, {counts['input']} input ({counts['cached']} cached) / {counts['output']} output tokens; usage returned for {counts['usage_records']} requests.")
    lines += ["", "Errors include setup, runtime, timeout and approval failures. They remain in the success denominator.",
              "See manifest.json for selection, versions, settings and limitations.", ""]
    report = directory / "report.md"
    report.write_text("\n".join(lines))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    print(summarize(parser.parse_args().directory.resolve()))
