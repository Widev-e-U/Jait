"""Package the native gateway for Harbor without copying credentials or a checkout."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / ".jait/artifacts/benchmarks"
PAYLOAD = ARTIFACTS / "payload"
LIB = PAYLOAD / "runtime/lib"
EXTERNALS = ["node-pty", "bun-pty", "@matrix-org/matrix-sdk-crypto-nodejs", "@parcel/watcher", "playwright"]


def build():
    LIB.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "tmp").mkdir(exist_ok=True)
    env = dict(os.environ, TMPDIR=str(ARTIFACTS / "tmp"))
    command = ["bun", "build", "packages/gateway/src/evaluation/isolated-gateway-child.ts",
               "--target", "bun", "--outfile", str(LIB / "gateway.js")]
    for name in EXTERNALS:
        command += ["--external", name]
    subprocess.run(command, cwd=ROOT, env=env, check=True)
    # createRequire calls retain source-relative version lookups after bundling.
    bundled = LIB / "gateway.js"
    bundled.write_text(bundled.read_text().replace('"../../package.json"', '"../../gateway-package.json"'))
    version = json.loads((ROOT / "packages/gateway/package.json").read_text())["version"]
    for target in [PAYLOAD / "gateway-package.json", PAYLOAD / "runtime/package.json"]:
        target.write_text(json.dumps({"version": version}))
    subprocess.run(["bun", "build", "scripts/benchmarks/jait-task.ts", "--target", "bun",
                    "--outfile", str(LIB / "jait-task.js")], cwd=ROOT, env=env, check=True)
    for name in EXTERNALS:
        source = ROOT / "packages/gateway/node_modules" / name
        destination = PAYLOAD / "node_modules" / name
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source.resolve(), destination, symlinks=False)
    executable = shutil.which("bun")
    if not executable:
        raise RuntimeError("Bun required")
    shutil.copy2(Path(executable).resolve(), PAYLOAD / "bun")
    # State and logs from smoke tests must never be installed in another trial.
    archive = ARTIFACTS / "jait-runtime.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for name in ["bun", "runtime", "node_modules", "gateway-package.json"]:
            tar.add(PAYLOAD / name, arcname=name)
    print(archive)


if __name__ == "__main__":
    build()
