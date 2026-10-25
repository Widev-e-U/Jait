#!/usr/bin/env python3
"""Run the native gate against a recorded source copy, isolated from concurrent edits.

Source stays in the working checkout. Only ignored/generated verification files
are created here. Dependency overlays pin installed external packages and route
workspace aliases to the frozen source. No existing worktree is reset or cleaned.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import re

ROOT = Path(__file__).resolve().parents[3]
BASE_OUTPUT = ROOT / ".jait/artifacts/gateway-rust"
# Independent validation runs must never refresh another run's source tree.
# A stable explicit lane also permits warm compiler caches on later batches.
RUN_LABEL = os.environ.get("JAIT_RUST_VALIDATION_RUN", "")
if RUN_LABEL and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", RUN_LABEL):
    raise ValueError("JAIT_RUST_VALIDATION_RUN must be a simple alphanumeric run label (max 64 characters)")
OUTPUT = BASE_OUTPUT / "runs" / RUN_LABEL if RUN_LABEL else BASE_OUTPUT
if not OUTPUT.resolve().is_relative_to(ROOT):
    raise ValueError("validation output must remain inside the project")
SNAPSHOT = OUTPUT / "frozen-source"
RUN_OUTPUT = SNAPSHOT / ".jait/artifacts"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_changed_source(source, target, expected_digest):
    """Invalidate timestamp-based compiler caches when snapshot bytes change.

    Git checkouts or restored edits may have mtimes older than a warm artifact.
    copy2 would retain those mtimes and allow Cargo to reuse stale native code.
    Unchanged sources keep their times so warm incremental checks remain useful.
    """
    if target.is_symlink():
        target.unlink()
    if not target.exists() or digest(target) != expected_digest:
        shutil.copyfile(source, target)


def link(path, target):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        if path.resolve() == target.resolve():
            return
        path.unlink()
    elif path.exists():
        raise RuntimeError(f"refusing to replace existing non-link: {path}")
    path.symlink_to(target, target_is_directory=target.is_dir())


def dependency_target(path):
    target = path.resolve()
    try:
        relative = target.relative_to(ROOT)
    except ValueError:
        return target
    if relative.parts[0] in ("packages", "apps") and "node_modules" not in relative.parts:
        return SNAPSHOT / relative
    return target


def overlay(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        if child.name.startswith("@") and child.is_dir():
            scope = destination / child.name
            scope.mkdir(parents=True, exist_ok=True)
            for item in child.iterdir():
                link(scope / item.name, dependency_target(item))
        else:
            link(destination / child.name, dependency_target(child))


def inventory_review_metadata_only(before, after):
    """Review annotations grant no native credit; preserve every inventory/runtime input.

    The native ledger independently binds credited implementations, contracts and targets.
    Allow concurrent reference-review annotations without calling them source drift.
    Exact frozen and live hashes are still recorded for this generated metadata file.
    """
    review_fields = {"status", "gap", "parity_review", "rust_cases"}
    def strict_inputs(value):
        if not isinstance(value, dict) or not isinstance(value.get("source_files"), list):
            raise ValueError("invalid inventory")
        rows = []
        for row in value["source_files"]:
            if not isinstance(row, dict) or not isinstance(row.get("path"), str) or not isinstance(row.get("fingerprint"), str):
                raise ValueError("invalid source inventory row")
            rows.append({key: item for key, item in row.items() if key not in review_fields})
        return value | {"source_files": rows}
    try:
        return strict_inputs(before) == strict_inputs(after)
    except (ValueError, TypeError):
        return False


def prepare_compiler_caches():
    # Native tests embed CARGO_MANIFEST_DIR. Reusing a live binary through a
    # target-directory symlink executes its live source root, defeating freezing.
    # Keep the native target physical. Contract runner targets include a source
    # root key and can therefore share their parent cache safely.
    for target in ("gateway-rust-target", "rust-contract-target"):
        cache = ROOT / ".jait/artifacts" / target
        destination = RUN_OUTPUT / target
        if target == "gateway-rust-target":
            if destination.is_symlink():
                destination.unlink()
            destination.mkdir(parents=True, exist_ok=True)
        elif cache.exists():
            link(destination, cache)


def acquire_run_lock(output):
    """Own one snapshot until validation and report publication finish."""
    output.mkdir(parents=True, exist_ok=True)
    lock = (output / "validation.lock").open("a+b")
    try:
        if os.name == "nt":
            import msvcrt
            if os.fstat(lock.fileno()).st_size == 0:
                lock.write(b"0")
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        lock.close()
        raise RuntimeError(f"validation snapshot is already in use: {output}; wait for the current run") from None
    return lock


def main():
    with acquire_run_lock(OUTPUT):
        run_locked()


def is_source_path(relative):
    return (".jait" not in relative.parts
            and relative.parts[0] not in (".git", ".agents", ".codex", ".aws")
            and relative.name != ".env")


def run_locked():
    isolation_tests = subprocess.run(
        ["python3", "-B", "tests/contract/tooling/test_native_validation_output.py"], cwd=ROOT
    )
    assert isolation_tests.returncode == 0, "validation output isolation checks failed"
    assert not SNAPSHOT.is_symlink()
    if RUN_OUTPUT.is_symlink():
        assert RUN_OUTPUT.resolve() == (OUTPUT / "frozen-output").resolve()
        RUN_OUTPUT.unlink()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    RUN_OUTPUT.mkdir(parents=True, exist_ok=True)
    raw = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    )
    paths = []
    for name in raw.decode().split("\0"):
        if not name:
            continue
        relative = Path(name)
        assert not relative.is_absolute() and ".." not in relative.parts
        if not is_source_path(relative) or not (ROOT / relative).is_file():
            continue
        paths.append(relative)
    before = {str(p): digest(ROOT / p) for p in paths}
    previous_manifest = OUTPUT / "frozen-source-manifest.json"
    if previous_manifest.exists():
        previous = json.loads(previous_manifest.read_text())["sources"]
        for name in previous.keys() - before.keys():
            stale = SNAPSHOT / name
            assert stale.is_relative_to(SNAPSHOT)
            if stale.is_file() or stale.is_symlink():
                stale.unlink()
    for relative in paths:
        source, target = ROOT / relative, SNAPSHOT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        copy_changed_source(source, target, before[str(relative)])
    copied = {str(p): digest(SNAPSHOT / p) for p in paths}
    after = {str(p): digest(ROOT / p) for p in paths}
    assert before == copied == after, "source changed while copying; retry snapshot preparation"
    modules = [ROOT / "node_modules"]
    modules += list((ROOT / "packages").glob("*/node_modules"))
    modules += list((ROOT / "apps").glob("*/node_modules"))
    for source in modules:
        if source.is_dir():
            overlay(source, SNAPSHOT / source.relative_to(ROOT))
    prepare_compiler_caches()
    # Workspace import conditions select dist exports. Build these from frozen
    # source so package aliases never escape to mutable live compiled output.
    with (OUTPUT / "frozen-workspace-build.log").open("w") as log:
        for package in ("shared", "screen-share", "api-client", "ui-shared"):
            built = subprocess.run(["bun", "run", "build"], cwd=SNAPSHOT / "packages" / package,
                                   stdout=log, stderr=subprocess.STDOUT)
            assert built.returncode == 0, f"frozen workspace build failed: {package}"
    # The reference installs its API not-found handler only when built web files
    # exist. Capture the same runtime assets instead of changing that assertion.
    runtime_asset_dirs = ("apps/web/dist", "packages/gateway/web-dist")
    for relative in runtime_asset_dirs:
        if (ROOT / relative).is_dir():
            shutil.copytree(ROOT / relative, SNAPSHOT / relative, dirs_exist_ok=True)
    workspace_outputs = {str(p.relative_to(SNAPSHOT)): digest(p)
                         for package in ("shared", "screen-share", "api-client", "ui-shared")
                         for p in (SNAPSHOT / "packages" / package / "dist").rglob("*") if p.is_file()}
    workspace_outputs.update({str(p.relative_to(SNAPSHOT)): digest(p)
                              for relative in runtime_asset_dirs
                              for p in (SNAPSHOT / relative).rglob("*") if p.is_file()})
    provenance = {
        "source_root": str(SNAPSHOT),
        "live_root": str(ROOT),
        "base_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "sources": copied,
        "workspace_outputs": workspace_outputs,
        "external_dependencies": "resolved installed package targets; workspace aliases point into source_root",
    }
    previous_manifest.write_text(json.dumps(provenance, indent=2) + "\n")
    if "--prepare-only" in __import__("sys").argv:
        print(json.dumps({"prepared": str(SNAPSHOT), "sources": len(copied), "workspace_outputs": len(workspace_outputs)}), flush=True)
        return
    report_file = RUN_OUTPUT / "gateway-rust/native-progress/report.json"
    report_file.unlink(missing_ok=True)
    with (OUTPUT / "frozen-validation.log").open("w") as log:
        classifier_tests = subprocess.run(
            ["python3", "-B", "tests/contract/tooling/test_native_inventory_metadata.py"],
            cwd=SNAPSHOT, stdout=log, stderr=subprocess.STDOUT,
        )
        assert classifier_tests.returncode == 0, "inventory metadata classification checks failed"
        lock_tests = subprocess.run(
            ["python3", "-B", "tests/contract/tooling/test_native_validation_lock.py"],
            cwd=SNAPSHOT, stdout=log, stderr=subprocess.STDOUT,
        )
        assert lock_tests.returncode == 0, "validation snapshot locking checks failed"
        result = subprocess.run(
            ["bun", "run", "test:gateway:rust"], cwd=SNAPSHOT,
            stdout=log, stderr=subprocess.STDOUT,
            env=os.environ | {"RUST_TEST_THREADS": "2"}
        )
    report_file = RUN_OUTPUT / "gateway-rust/native-progress/report.json"
    if not report_file.exists():
        raise RuntimeError(f"native gate produced no report; inspect {OUTPUT / 'frozen-validation.log'}")
    report = json.loads(report_file.read_text())
    drift = [p for p, h in report["sources"].items()
             if not (ROOT / p).is_file() or digest(ROOT / p) != h]
    metadata_drift = []
    inventory_path = "tests/contract/coverage.json"
    if inventory_path in drift:
        try:
            frozen_inventory = json.loads((SNAPSHOT / inventory_path).read_text())
            live_inventory_bytes = (ROOT / inventory_path).read_bytes()
            live_inventory = json.loads(live_inventory_bytes)
            if inventory_review_metadata_only(frozen_inventory, live_inventory):
                metadata_drift.append({
                    "path": inventory_path,
                    "frozen_sha256": report["sources"][inventory_path],
                    "live_sha256": hashlib.sha256(live_inventory_bytes).hexdigest(),
                    "classification": "reference review annotations only; native credit unchanged",
                })
                drift.remove(inventory_path)
        except (OSError, ValueError):
            pass
    report["validation_snapshot_lock_checked"] = True
    report["inventory_metadata_classifier_checked"] = True
    report["live_validation_metadata_drift"] = metadata_drift
    report["live_fingerprints_exact_match"] = not drift and not metadata_drift
    outputs_stable = all((SNAPSHOT / p).is_file() and digest(SNAPSHOT / p) == h for p, h in workspace_outputs.items())
    report["workspace_outputs_unchanged"] = outputs_stable
    report["workspace_output_hashes"] = workspace_outputs
    if not outputs_stable:
        report.update(passed=False, verified_components=0, verified_percent=0)
    report["source_root"] = str(SNAPSHOT)
    report["source_manifest"] = str(previous_manifest.relative_to(ROOT))
    report["live_source_drift"] = drift
    report["live_sources_match"] = not drift
    canonical = OUTPUT / "native-progress/report.json"
    canonical.parent.mkdir(parents=True, exist_ok=True)
    canonical.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in (
        "passed", "sources_unchanged", "verified_components", "verified_percent",
        "source_root", "live_sources_match", "live_source_drift", "live_validation_metadata_drift"
    )}), flush=True)
    assert result.returncode == 0 and report["passed"], "frozen gate failed; inspect frozen-validation.log"
    count = report["verified_components"]
    checkpoint = OUTPUT / f"checkpoints/{count}-report.json"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(canonical, checkpoint)
    state_file = OUTPUT / "goal-checkpoint.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    state.update(
        goal=f"Reach {report['inventory_total']}/{report['inventory_total']} verified native components without replacing the production gateway.",
        verified_components=count, verified_percent=report["verified_percent"],
        inventory_total=report["inventory_total"], goal_met=count == report["inventory_total"] and report["live_fingerprints_exact_match"],
        source_root=str(SNAPSHOT), live_sources_match=not drift, live_source_drift=drift,
        live_validation_metadata_drift=metadata_drift,
        latest_report=str(checkpoint.relative_to(ROOT)),
        latest_frozen_report=str(checkpoint.relative_to(ROOT)),
        last_live_matched_report=(str(checkpoint.relative_to(ROOT)) if report["live_fingerprints_exact_match"] else state.get("last_live_matched_report")),
        validation_note=(f"{count}/{report['inventory_total']} full native gate passed with {len(report['targets'])} differential targets; "
                         + ("live source fingerprints match." if report["live_fingerprints_exact_match"] else
                            "live runtime inputs match; review metadata differs." if not drift else "live source drift remains; inspect report.")),
        next=("Final component checks met; evaluate broader replacement-readiness gates." if count == report["inventory_total"] and report["live_fingerprints_exact_match"]
              else "Continue unported components from remaining-native-components.json; refresh the inventory after each credited batch."),
        phase="Verified frozen source checkpoint; continue until all inventoried components pass",
        pending_full_gate=[],
        current_live_validation=("Exact live fingerprints match the completed gate." if report["live_fingerprints_exact_match"] else "Completed frozen gate; live drift remains in the report."),
    )
    state_file.write_text(json.dumps(state, indent=2) + "\n")


if __name__ == "__main__":
    main()
