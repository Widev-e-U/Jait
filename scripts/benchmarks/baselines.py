"""Dependency repairs for Harbor 0.25.0; baseline agent behavior is unchanged."""
from harbor.agents.installed.mini_swe_agent import MiniSweAgent
from harbor.environments.base import BaseEnvironment


class MiniSweAgentWithDependencies(MiniSweAgent):
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)
        # LiteLLM's tools import path needs MCP, absent from Harbor's install list.
        await self.exec_as_agent(
            environment,
            command='"$HOME/.local/bin/uv" pip install --python '
                    '"$HOME/.local/share/uv/tools/mini-swe-agent/bin/python" mcp==2.3.0',
            timeout_sec=120,
        )
