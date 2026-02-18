"""
Agent core using LangChain for multi-provider LLM support
"""
import json
from typing import AsyncGenerator, Optional, Any
from langchain_core.messages import (
    BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage, AIMessageChunk
)
from langchain_core.tools import tool
from langchain_core.output_parsers import StrOutputParser

from app.config import get_settings
from app.agent.providers import get_llm, LLMProvider, convert_to_langchain_messages
from app.agent.prompts import SYSTEM_PROMPT

settings = get_settings()

MAX_TURNS = 10


class Agent:
    """
    LangChain-based agent with tool calling support.
    Supports multiple LLM providers via the providers module.
    """
    
    def __init__(
        self,
        provider: Optional[LLMProvider] = None,
        model: Optional[str] = None,
        tools: Optional[list] = None
    ):
        self.provider = provider
        self.model = model
        self._llm = None
        self._tools = tools or []
        self._tool_handlers = {}
        
    @property
    def llm(self):
        """Lazy-load LLM instance."""
        if self._llm is None:
            self._llm = get_llm(
                provider=self.provider,
                model=self.model,
                temperature=0.7
            )
        return self._llm
    
    def bind_tools(self, tools: list, handlers: dict[str, callable]):
        """
        Bind tools to the agent.
        
        Args:
            tools: List of tool definitions (LangChain format)
            handlers: Dict mapping tool names to handler functions
        """
        self._tools = tools
        self._tool_handlers = handlers
        
    async def chat(
        self,
        message: str,
        history: list[dict] = None
    ) -> tuple[str, list[dict]]:
        """
        Non-streaming chat with tool support.
        
        Returns:
            Tuple of (response_content, tool_calls_made)
        """
        messages = self._build_messages(message, history or [])
        tool_calls_made = []
        
        # Bind tools to LLM if available
        llm = self.llm
        if self._tools:
            llm = llm.bind_tools(self._tools)
        
        for turn in range(MAX_TURNS):
            response = await llm.ainvoke(messages)
            
            # Check for tool calls
            if hasattr(response, 'tool_calls') and response.tool_calls:
                # Add assistant message with tool calls
                messages.append(response)
                
                for tool_call in response.tool_calls:
                    tool_name = tool_call.get("name", "")
                    arguments = tool_call.get("args", {})
                    tool_call_id = tool_call.get("id", f"call_{len(tool_calls_made)}")
                    
                    # Execute tool
                    result = await self._execute_tool(tool_name, arguments)
                    
                    tool_calls_made.append({
                        "tool": tool_name,
                        "arguments": arguments,
                        "result": result
                    })
                    
                    # Add tool result message
                    messages.append(ToolMessage(
                        content=json.dumps(result, default=str),
                        tool_call_id=tool_call_id
                    ))
            else:
                # No tool calls, return response
                return response.content, tool_calls_made
        
        return "I've reached the maximum number of tool calls.", tool_calls_made
    
    async def chat_stream(
        self,
        message: str,
        history: list[dict] = None,
        include_thinking: bool = True
    ) -> AsyncGenerator[dict, None]:
        """
        Streaming chat with tool support.
        
        Yields dicts with types: token, thinking, tool_call, tool_result, done
        """
        messages = self._build_messages(message, history or [])
        tool_calls_made = []
        
        # Bind tools to LLM if available
        llm = self.llm
        if self._tools:
            llm = llm.bind_tools(self._tools)
        
        for turn in range(MAX_TURNS):
            accumulated_content = ""
            accumulated_tool_calls = []
            
            async for chunk in llm.astream(messages):
                # Handle content chunks
                if hasattr(chunk, 'content') and chunk.content:
                    accumulated_content += chunk.content
                    yield {"type": "token", "content": chunk.content}
                
                # Handle tool call chunks (accumulated)
                if hasattr(chunk, 'tool_call_chunks') and chunk.tool_call_chunks:
                    for tc_chunk in chunk.tool_call_chunks:
                        # Find or create tool call entry
                        idx = tc_chunk.get("index", 0)
                        while len(accumulated_tool_calls) <= idx:
                            accumulated_tool_calls.append({
                                "id": "",
                                "name": "",
                                "args": ""
                            })
                        
                        if tc_chunk.get("id"):
                            accumulated_tool_calls[idx]["id"] = tc_chunk["id"]
                        if tc_chunk.get("name"):
                            accumulated_tool_calls[idx]["name"] = tc_chunk["name"]
                        if tc_chunk.get("args"):
                            accumulated_tool_calls[idx]["args"] += tc_chunk["args"]
            
            # Process accumulated tool calls
            if accumulated_tool_calls:
                # Build AIMessage with tool calls
                tool_calls_parsed = []
                for tc in accumulated_tool_calls:
                    try:
                        args = json.loads(tc["args"]) if tc["args"] else {}
                    except json.JSONDecodeError:
                        args = {}
                    
                    tool_calls_parsed.append({
                        "id": tc["id"] or f"call_{len(tool_calls_made)}",
                        "name": tc["name"],
                        "args": args
                    })
                
                messages.append(AIMessage(
                    content=accumulated_content,
                    tool_calls=tool_calls_parsed
                ))
                
                # Execute each tool
                for tc in tool_calls_parsed:
                    tool_name = tc["name"]
                    arguments = tc["args"]
                    tool_call_id = tc["id"]
                    
                    yield {"type": "tool_call", "tool": tool_name, "arguments": arguments}
                    
                    result = await self._execute_tool(tool_name, arguments)
                    
                    tool_calls_made.append({
                        "tool": tool_name,
                        "arguments": arguments,
                        "result": result
                    })
                    
                    yield {"type": "tool_result", "tool": tool_name, "result": result}
                    
                    messages.append(ToolMessage(
                        content=json.dumps(result, default=str),
                        tool_call_id=tool_call_id
                    ))
            else:
                # No tool calls, we're done
                yield {"type": "done", "tool_calls": tool_calls_made}
                return
        
        yield {"type": "done", "tool_calls": tool_calls_made, "max_turns_reached": True}
    
    async def _execute_tool(self, tool_name: str, arguments: dict) -> Any:
        """Execute a tool by name with given arguments."""
        handler = self._tool_handlers.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}
        
        try:
            # Check if handler is async
            import asyncio
            if asyncio.iscoroutinefunction(handler):
                result = await handler(arguments)
            else:
                result = handler(arguments)
            return result
        except Exception as e:
            return {"error": str(e)}
    
    def _build_messages(self, message: str, history: list[dict]) -> list[BaseMessage]:
        """Build LangChain message list from history."""
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        
        # Convert history (limit to last 20 for context)
        for msg in history[-20:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
            elif role == "tool":
                # Tool messages need tool_call_id - use placeholder if not available
                tool_call_id = msg.get("tool_call_id", "call_0")
                messages.append(ToolMessage(content=content, tool_call_id=tool_call_id))
        
        # Add current message
        messages.append(HumanMessage(content=message))
        
        return messages


# Global agent instance (lazy initialization)
_agent: Optional[Agent] = None


def get_agent(
    provider: Optional[LLMProvider] = None,
    model: Optional[str] = None
) -> Agent:
    """
    Get or create the global agent instance.
    
    For custom provider/model, creates a new agent (not cached).
    For defaults, returns cached singleton.
    """
    global _agent
    
    if provider is not None or model is not None:
        # Custom configuration - create new agent
        return Agent(provider=provider, model=model)
    
    if _agent is None:
        _agent = Agent()
    
    return _agent


def create_agent(
    provider: Optional[LLMProvider] = None,
    model: Optional[str] = None,
    tools: Optional[list] = None
) -> Agent:
    """Create a new agent instance with specific configuration."""
    return Agent(provider=provider, model=model, tools=tools)
