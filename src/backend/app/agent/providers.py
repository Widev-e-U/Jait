"""
Multi-Provider LLM Factory using LangChain
Supports OpenAI, Anthropic, Ollama, and local models
"""
from enum import Enum
from typing import Optional, Any
from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool

from app.config import get_settings


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    LOCAL = "local"


def get_llm(
    provider: Optional[LLMProvider] = None,
    model: Optional[str] = None,
    temperature: float = 0.7,
    **kwargs
) -> BaseChatModel:
    """
    Factory function to create LLM instances based on provider.
    
    Args:
        provider: LLM provider (defaults to settings)
        model: Model name (defaults to settings)
        temperature: Sampling temperature
        **kwargs: Additional provider-specific arguments
    
    Returns:
        LangChain BaseChatModel instance
    """
    settings = get_settings()
    
    provider = provider or LLMProvider(settings.llm_provider)
    
    if provider == LLMProvider.OPENAI:
        return _create_openai_llm(model, temperature, **kwargs)
    elif provider == LLMProvider.ANTHROPIC:
        return _create_anthropic_llm(model, temperature, **kwargs)
    elif provider == LLMProvider.OLLAMA:
        return _create_ollama_llm(model, temperature, **kwargs)
    elif provider == LLMProvider.LOCAL:
        return _create_local_llm(model, temperature, **kwargs)
    else:
        raise ValueError(f"Unsupported provider: {provider}")


def _create_openai_llm(
    model: Optional[str] = None,
    temperature: float = 0.7,
    **kwargs
) -> BaseChatModel:
    """Create OpenAI chat model."""
    from langchain_openai import ChatOpenAI
    
    settings = get_settings()
    
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is required for OpenAI provider")
    
    return ChatOpenAI(
        model=model or settings.openai_model,
        temperature=temperature,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url if settings.openai_base_url else None,
        **kwargs
    )


def _create_anthropic_llm(
    model: Optional[str] = None,
    temperature: float = 0.7,
    **kwargs
) -> BaseChatModel:
    """Create Anthropic chat model."""
    from langchain_anthropic import ChatAnthropic
    
    settings = get_settings()
    
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY is required for Anthropic provider")
    
    return ChatAnthropic(
        model=model or settings.anthropic_model,
        temperature=temperature,
        api_key=settings.anthropic_api_key,
        **kwargs
    )


def _create_ollama_llm(
    model: Optional[str] = None,
    temperature: float = 0.7,
    **kwargs
) -> BaseChatModel:
    """Create Ollama chat model."""
    from langchain_ollama import ChatOllama
    
    settings = get_settings()
    
    return ChatOllama(
        model=model or settings.ollama_model,
        temperature=temperature,
        base_url=settings.ollama_base_url,
        num_ctx=kwargs.pop("num_ctx", 8192),
        **kwargs
    )


def _create_local_llm(
    model: Optional[str] = None,
    temperature: float = 0.7,
    **kwargs
) -> BaseChatModel:
    """
    Create local model via Ollama (running locally).
    For truly local models, you can extend this to use llama-cpp-python, etc.
    """
    from langchain_ollama import ChatOllama
    
    settings = get_settings()
    
    # Local defaults to localhost Ollama
    base_url = settings.local_model_url or "http://localhost:11434"
    
    return ChatOllama(
        model=model or settings.local_model_name or "llama3.2",
        temperature=temperature,
        base_url=base_url,
        num_ctx=kwargs.pop("num_ctx", 8192),
        **kwargs
    )


def convert_to_langchain_messages(messages: list[dict]) -> list[BaseMessage]:
    """Convert dict messages to LangChain message objects."""
    converted = []
    
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        if role == "system":
            converted.append(SystemMessage(content=content))
        elif role == "user":
            converted.append(HumanMessage(content=content))
        elif role == "assistant":
            # Handle tool calls in assistant messages
            tool_calls = msg.get("tool_calls", [])
            if tool_calls:
                converted.append(AIMessage(
                    content=content,
                    tool_calls=[
                        {
                            "id": tc.get("id", f"call_{i}"),
                            "name": tc.get("function", {}).get("name", ""),
                            "args": tc.get("function", {}).get("arguments", {})
                        }
                        for i, tc in enumerate(tool_calls)
                    ]
                ))
            else:
                converted.append(AIMessage(content=content))
        elif role == "tool":
            # Tool results
            tool_call_id = msg.get("tool_call_id", "")
            converted.append(ToolMessage(content=content, tool_call_id=tool_call_id))
    
    return converted


def get_available_providers() -> list[dict]:
    """Return list of available/configured providers."""
    settings = get_settings()
    providers = []
    
    # Ollama is always available if configured
    if settings.ollama_base_url:
        providers.append({
            "id": LLMProvider.OLLAMA.value,
            "name": "Ollama",
            "model": settings.ollama_model,
            "available": True
        })
    
    # OpenAI
    providers.append({
        "id": LLMProvider.OPENAI.value,
        "name": "OpenAI",
        "model": settings.openai_model,
        "available": bool(settings.openai_api_key)
    })
    
    # Anthropic
    providers.append({
        "id": LLMProvider.ANTHROPIC.value,
        "name": "Anthropic",
        "model": settings.anthropic_model,
        "available": bool(settings.anthropic_api_key)
    })
    
    # Local
    providers.append({
        "id": LLMProvider.LOCAL.value,
        "name": "Local",
        "model": settings.local_model_name or "llama3.2",
        "available": bool(settings.local_model_url)
    })
    
    return providers


@lru_cache()
def get_default_llm() -> BaseChatModel:
    """Get the default LLM instance (cached)."""
    return get_llm()
