"""
Tool definitions and executor for the agent
Supports both Ollama native format and LangChain format
"""
import json
import math
from datetime import datetime
from typing import Any, Callable
import httpx


# Tool Definitions (Ollama format - kept for compatibility)
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_datetime",
            "description": "Get the current date and time. Use this for any questions about what day/time it is.",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "Optional timezone (e.g., 'UTC', 'America/New_York'). Defaults to UTC."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Perform mathematical calculations. Supports basic arithmetic, powers, roots, trigonometry, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(3.14159/2)')"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "python_eval",
            "description": "Execute a simple Python expression and return the result. Use for data manipulation, string operations, or list processing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Python expression to evaluate (single expression, not statements)"
                    }
                },
                "required": ["code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information. Use for current events, facts, or anything requiring up-to-date information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default: 3)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_text",
            "description": "Generate or transform text based on instructions. Use for summarization, rewriting, translation hints, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": "What to do with the text"
                    },
                    "text": {
                        "type": "string",
                        "description": "The text to process"
                    }
                },
                "required": ["instruction", "text"]
            }
        }
    }
]


# LangChain-compatible tool definitions (OpenAI format)
LANGCHAIN_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_datetime",
            "description": "Get the current date and time. Use this for any questions about what day/time it is.",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {
                        "type": "string",
                        "description": "Optional timezone (e.g., 'UTC', 'America/New_York'). Defaults to UTC."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Perform mathematical calculations. Supports basic arithmetic, powers, roots, trigonometry, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(3.14159/2)')"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "python_eval",
            "description": "Execute a simple Python expression and return the result. Use for data manipulation, string operations, or list processing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Python expression to evaluate (single expression, not statements)"
                    }
                },
                "required": ["code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information. Use for current events, facts, or anything requiring up-to-date information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default: 3)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_text",
            "description": "Generate or transform text based on instructions. Use for summarization, rewriting, translation hints, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction": {
                        "type": "string",
                        "description": "What to do with the text"
                    },
                    "text": {
                        "type": "string",
                        "description": "The text to process"
                    }
                },
                "required": ["instruction", "text"]
            }
        }
    }
]


class ToolExecutor:
    """
    Execute tools and return results.
    Provides both direct execution and handler dict for LangChain integration.
    """
    
    def __init__(self):
        # Public handlers dict - used by LangChain agent
        self.tool_handlers: dict[str, Callable] = {
            "get_datetime": self._get_datetime,
            "calculator": self._calculator,
            "python_eval": self._python_eval,
            "web_search": self._web_search,
            "generate_text": self._generate_text,
        }
    
    def register_tool(self, name: str, handler: Callable):
        """Register a new tool handler."""
        self.tool_handlers[name] = handler
    
    def execute(self, tool_name: str, arguments: dict[str, Any]) -> str:
        """Execute a tool and return the result as a JSON string."""
        handler = self.tool_handlers.get(tool_name)
        if not handler:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
        
        try:
            result = handler(arguments)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    def _get_datetime(self, args: dict) -> dict:
        """Get current datetime."""
        tz = args.get("timezone", "UTC")
        now = datetime.utcnow()
        return {
            "datetime": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M:%S"),
            "day_of_week": now.strftime("%A"),
            "timezone": tz,
            "unix_timestamp": int(now.timestamp())
        }
    
    def _calculator(self, args: dict) -> dict:
        """Evaluate mathematical expression safely."""
        expression = args.get("expression", "")
        
        # Safe math functions
        allowed_names = {
            "abs": abs, "round": round, "min": min, "max": max,
            "sum": sum, "pow": pow, "len": len,
            "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
            "log": math.log, "log10": math.log10, "log2": math.log2,
            "exp": math.exp, "floor": math.floor, "ceil": math.ceil,
            "pi": math.pi, "e": math.e,
            "asin": math.asin, "acos": math.acos, "atan": math.atan,
            "sinh": math.sinh, "cosh": math.cosh, "tanh": math.tanh,
            "degrees": math.degrees, "radians": math.radians,
            "factorial": math.factorial, "gcd": math.gcd,
        }
        
        try:
            # Evaluate with restricted builtins
            result = eval(expression, {"__builtins__": {}}, allowed_names)
            return {"expression": expression, "result": result}
        except Exception as e:
            return {"expression": expression, "error": str(e)}
    
    def _python_eval(self, args: dict) -> dict:
        """Evaluate Python expression (more permissive than calculator)."""
        code = args.get("code", "")
        
        # Limited safe builtins
        safe_builtins = {
            "abs": abs, "all": all, "any": any, "bool": bool,
            "dict": dict, "enumerate": enumerate, "filter": filter,
            "float": float, "int": int, "len": len, "list": list,
            "map": map, "max": max, "min": min, "range": range,
            "reversed": reversed, "round": round, "set": set,
            "sorted": sorted, "str": str, "sum": sum, "tuple": tuple,
            "zip": zip, "True": True, "False": False, "None": None,
        }
        
        try:
            result = eval(code, {"__builtins__": safe_builtins}, {})
            return {"code": code, "result": result}
        except Exception as e:
            return {"code": code, "error": str(e)}
    
    def _web_search(self, args: dict) -> dict:
        """
        Web search stub - returns mock results.
        In production, integrate with a real search API (SearXNG, Brave, etc.)
        """
        query = args.get("query", "")
        num_results = args.get("num_results", 3)
        
        # Mock response - replace with real search API in production
        return {
            "query": query,
            "note": "This is a mock search. Integrate with SearXNG, Brave Search API, or similar for real results.",
            "results": [
                {
                    "title": f"Search result for: {query}",
                    "snippet": f"This is a placeholder result. To enable real search, configure a search API.",
                    "url": "https://example.com"
                }
            ]
        }
    
    def _generate_text(self, args: dict) -> dict:
        """
        Text generation/transformation.
        This is handled by the LLM itself - just return the instruction for context.
        """
        instruction = args.get("instruction", "")
        text = args.get("text", "")
        
        return {
            "instruction": instruction,
            "text": text,
            "note": "Text transformation should be handled by the main LLM response."
        }


def get_tool_descriptions() -> str:
    """Get human-readable tool descriptions for the prompt."""
    descriptions = []
    for tool in TOOLS:
        func = tool["function"]
        name = func["name"]
        desc = func["description"]
        params = func["parameters"].get("properties", {})
        
        param_strs = []
        for pname, pinfo in params.items():
            param_strs.append(f"  - {pname}: {pinfo.get('description', 'No description')}")
        
        param_section = "\n".join(param_strs) if param_strs else "  (no parameters)"
        descriptions.append(f"**{name}**: {desc}\nParameters:\n{param_section}")
    
    return "\n\n".join(descriptions)


def get_all_tools() -> list:
    """Get all tools including cron tools."""
    from app.agent.cron_tools import CRON_TOOLS
    return LANGCHAIN_TOOLS + CRON_TOOLS


def get_all_langchain_tools() -> list:
    """Get all LangChain-compatible tool definitions."""
    from app.agent.cron_tools import CRON_TOOLS
    return LANGCHAIN_TOOLS + CRON_TOOLS
