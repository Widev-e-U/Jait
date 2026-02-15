import json
import httpx
from typing import AsyncGenerator, Optional
from app.config import get_settings
from app.agent.tools import TOOLS, ToolExecutor, get_tool_descriptions
from app.agent.prompts import SYSTEM_PROMPT

settings = get_settings()

MAX_TURNS = 10


class Agent:
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.tool_executor = ToolExecutor()
        self.timeout = httpx.Timeout(120.0, connect=10.0)

    async def chat(
        self,
        message: str,
        history: list[dict] = None
    ) -> tuple[str, list[dict]]:
        messages = self._build_messages(message, history or [])
        tool_calls_made = []

        for turn in range(MAX_TURNS):
            response = await self._call_ollama(messages, use_tools=True)

            if response.get("message", {}).get("tool_calls"):
                tool_calls = response["message"]["tool_calls"]

                for tc in tool_calls:
                    func = tc.get("function", {})
                    tool_name = func.get("name", "")
                    arguments = func.get("arguments", {})

                    if isinstance(arguments, str):
                        try:
                            arguments = json.loads(arguments)
                        except json.JSONDecodeError:
                            arguments = {}

                    result = self.tool_executor.execute(tool_name, arguments)

                    tool_calls_made.append({
                        "tool": tool_name,
                        "arguments": arguments,
                        "result": json.loads(result) if result.startswith("{") else result
                    })

                    messages.append({
                        "role": "assistant",
                        "content": response["message"].get("content", ""),
                        "tool_calls": tool_calls
                    })
                    messages.append({
                        "role": "tool",
                        "content": result
                    })
            else:
                content = response.get("message", {}).get("content", "")
                return content, tool_calls_made

        return "I've reached the maximum number of tool calls.", tool_calls_made

    async def chat_stream(
        self,
        message: str,
        history: list[dict] = None
    ) -> AsyncGenerator[dict, None]:
        messages = self._build_messages(message, history or [])
        tool_calls_made = []

        for turn in range(MAX_TURNS):
            accumulated_content = ""
            accumulated_thinking = ""
            tool_calls_in_response = []
            has_tool_calls = False

            payload = {
                "model": self.model,
                "messages": messages,
                "stream": True,
                "think": True,
                "tools": TOOLS,
                "options": {
                    "temperature": 0.7,
                    "num_ctx": 8192
                }
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json=payload
                ) as response:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            msg = chunk.get("message", {})

                            if msg.get("thinking"):
                                accumulated_thinking += msg["thinking"]
                                yield {"type": "thinking", "content": msg["thinking"]}

                            if msg.get("content"):
                                accumulated_content += msg["content"]
                                yield {"type": "token", "content": msg["content"]}

                            if msg.get("tool_calls"):
                                tool_calls_in_response = msg["tool_calls"]
                                has_tool_calls = True

                            if chunk.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue

            if has_tool_calls:
                for tc in tool_calls_in_response:
                    func = tc.get("function", {})
                    tool_name = func.get("name", "")
                    arguments = func.get("arguments", {})

                    if isinstance(arguments, str):
                        try:
                            arguments = json.loads(arguments)
                        except json.JSONDecodeError:
                            arguments = {}

                    yield {"type": "tool_call", "tool": tool_name, "arguments": arguments}

                    result = self.tool_executor.execute(tool_name, arguments)
                    result_parsed = json.loads(result) if result.startswith("{") else result

                    tool_calls_made.append({
                        "tool": tool_name,
                        "arguments": arguments,
                        "result": result_parsed
                    })

                    yield {"type": "tool_result", "tool": tool_name, "result": result_parsed}

                messages.append({
                    "role": "assistant",
                    "content": accumulated_content,
                    "tool_calls": tool_calls_in_response
                })
                for tc_made in tool_calls_made[-len(tool_calls_in_response):]:
                    messages.append({
                        "role": "tool",
                        "content": json.dumps(tc_made["result"], default=str)
                    })
            else:
                yield {"type": "done", "tool_calls": tool_calls_made}
                return

        yield {"type": "done", "tool_calls": tool_calls_made, "max_turns_reached": True}

    def _build_messages(self, message: str, history: list[dict]) -> list[dict]:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

        for msg in history[-20:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        messages.append({"role": "user", "content": message})
        return messages

    async def _call_ollama(
        self,
        messages: list[dict],
        use_tools: bool = True,
        stream: bool = False
    ) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "think": True,
            "options": {
                "temperature": 0.7,
                "num_ctx": 8192
            }
        }

        if use_tools:
            payload["tools"] = TOOLS

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json=payload
            )
            response.raise_for_status()
            return response.json()


_agent: Optional[Agent] = None


def get_agent() -> Agent:
    global _agent
    if _agent is None:
        _agent = Agent()
    return _agent
