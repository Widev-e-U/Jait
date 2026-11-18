"""Harbor adapter. Install only the curated runtime, never mount the host checkout."""
import json
import os
from pathlib import Path
import shlex

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / ".jait/artifacts/benchmarks"
INSTALL = "/opt/jait-benchmark"


class JaitAgent(BaseAgent):
    @staticmethod
    def name() -> str:
        return "jait"

    def version(self) -> str | None:
        return json.loads((ROOT / "packages/gateway/package.json").read_text())["version"]

    async def setup(self, environment: BaseEnvironment) -> None:
        archive = ARTIFACTS / "jait-runtime.tar.gz"
        if not archive.exists():
            raise RuntimeError("Run scripts/benchmarks/build.py first")
        await environment.exec(command=f"mkdir -p {INSTALL}", user="root", timeout_sec=30)
        await environment.upload_file(archive, f"{INSTALL}/runtime.tar.gz")
        result = await environment.exec(
            command=f"tar -xzf {INSTALL}/runtime.tar.gz -C {INSTALL} && chmod +x {INSTALL}/bun",
            user="root", timeout_sec=120,
        )
        if result.return_code:
            raise RuntimeError("Jait runtime unpack failed: " + str(result.stderr))
        await environment.exec(command=f"mkdir -p {INSTALL}/.jait/artifacts", timeout_sec=30)

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        base_url = os.environ.get("JAIT_BENCH_BASE_URL")
        model = os.environ.get("JAIT_BENCH_MODEL")
        if not base_url or not model:
            raise RuntimeError("JAIT_BENCH_BASE_URL and JAIT_BENCH_MODEL required")
        prompt = self.logs_dir / "instruction.txt"
        prompt.write_text(instruction)
        target = f"{INSTALL}/.jait/artifacts/instruction.txt"
        await environment.upload_file(prompt, target)
        try:
            result = await environment.exec(
                command=f"{INSTALL}/bun {INSTALL}/runtime/lib/jait-task.js {shlex.quote(target)}",
                env={"JAIT_BENCH_BASE_URL": base_url, "JAIT_BENCH_MODEL": model,
                     "JAIT_BENCH_TIMEOUT": "900",
                     "JAIT_BENCH_API_KEY": os.environ["JAIT_BENCH_API_KEY"]}, timeout_sec=930,
            )
            (self.logs_dir / "jait-stdout.log").write_text(result.stdout or "")
            (self.logs_dir / "jait-stderr.log").write_text(result.stderr or "")
            if result.return_code:
                raise RuntimeError("Jait task failed: " + str(result.stderr)[-2000:])
        finally:
            await environment.download_dir(f"{INSTALL}/.jait/artifacts/run", self.logs_dir / "jait")
        context.metadata = {"provider": "jait", "model": model}
