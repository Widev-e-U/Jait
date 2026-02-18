"""
Agent core - unified interface supporting multiple LLM providers via LangChain
"""
import json
from typing import AsyncGenerator, Optional
from app.config import get_settings
from app.agent.tools import TOOLS, LANGCHAIN_TOOLS, ToolExecutor, get_tool_descriptions
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.core_langchain import Agent as LangChainAgent, LLMProvider

settings = get_settings()

MAX_TURNS = 10


class Agent:
    """
    Agent class that wraps LangChain-based implementation.
    Provides backward-compatible interface.
    """
    
    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None
    ):
        # Convert string provider to enum if needed
        provider_enum = None
        if provider:
            provider_enum = LLMProvider(provider)
        
        # Create LangChain agent
        self._agent = LangChainAgent(
            provider=provider_enum,
            model=model
        )
        
        # Initialize tool executor and bind tools
        self.tool_executor = ToolExecutor()
        self._agent.bind_tools(
            tools=LANGCHAIN_TOOLS,
            handlers=self.tool_executor.tool_handlers
        )
    
    async def chat(
        self,
        message: str,
        history: list[dict] = None
    ) -> tuple[str, list[dict]]:
        """
        Non-streaming chat with tool support.
        Backward compatible with original implementation.
        """
        return await self._agent.chat(message, history)
    
    async def chat_stream(
        self,
        message: str,
        history: list[dict] = None
    ) -> AsyncGenerator[dict, None]:
        """
        Streaming chat with tool support.
        Yields dicts with types: token, thinking, tool_call, tool_result, done
        """
        async for chunk in self._agent.chat_stream(message, history):
            yield chunk


# Global agent instance
_agent: Optional[Agent] = None


def get_agent(
    provider: Optional[str] = None,
    model: Optional[str] = None
) -> Agent:
    """
    Get or create the global agent instance.
    
    Args:
        provider: LLM provider ('openai', 'anthropic', 'ollama', 'local')
        model: Model name override
    
    Returns:
        Agent instance
    """
    global _agent
    
    if provider is not None or model is not None:
        # Custom configuration - create new agent
        return Agent(provider=provider, model=model)
    
    if _agent is None:
        _agent = Agent()
    
    return _agent


def reset_agent():
    """Reset the global agent instance (useful for testing or config changes)."""
    global _agent
    _agent = None

