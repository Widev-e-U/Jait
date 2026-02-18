"""
Chat routes with SSE streaming
"""
import json
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, AsyncGenerator

from app.models.database import get_db
from app.models.schemas import User, Session, Message, ChatRequest, ChatResponse, SessionResponse
from app.auth import get_current_user_optional
from app.agent import get_agent
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/chat", tags=["chat"])


class StreamChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


async def get_or_create_session(
    session_id: Optional[str],
    user_id: Optional[str],
    db: AsyncSession
) -> Session:
    """Get existing session or create new one."""
    if session_id:
        result = await db.execute(
            select(Session).where(Session.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            return session
    
    # Create new session
    session = Session(
        id=str(uuid.uuid4()),
        user_id=user_id,
        prompt_count=0
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def check_prompt_limit(
    session: Session,
    user_id: Optional[str],
    db: AsyncSession
) -> tuple[bool, Optional[int]]:
    """
    Check if user has exceeded prompt limit.
    Returns (allowed, remaining_prompts).
    """
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return False, 0
        today = date.today()
        if user.last_prompt_date != today:
            user.daily_prompt_count = 0
            user.last_prompt_date = today
            await db.commit()
        remaining = max(0, settings.max_daily_prompts - user.daily_prompt_count)
        return remaining > 0, remaining

    remaining = max(0, settings.max_anonymous_prompts - session.prompt_count)
    return remaining > 0, remaining


async def increment_prompt_count(
    session: Session,
    user_id: Optional[str],
    db: AsyncSession
) -> Optional[int]:
    """Increment prompt count and return remaining prompts."""
    session.prompt_count += 1
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            today = date.today()
            if user.last_prompt_date != today:
                user.daily_prompt_count = 1
                user.last_prompt_date = today
            else:
                user.daily_prompt_count += 1
            await db.commit()
            return max(0, settings.max_daily_prompts - user.daily_prompt_count)
    await db.commit()
    return max(0, settings.max_anonymous_prompts - session.prompt_count)


async def get_chat_history(session_id: str, db: AsyncSession) -> list[dict]:
    """Get chat history for a session."""
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    
    return [
        {"role": msg.role, "content": msg.content}
        for msg in messages
    ]


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Send a message and get a response (non-streaming).
    """
    user_id = current_user["sub"] if current_user else None
    
    # Get or create session
    session = await get_or_create_session(request.session_id, user_id, db)
    
    # Check prompt limit
    allowed, remaining = await check_prompt_limit(session, user_id, db)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="limit_reached" if user_id else "login_required",
            headers={"X-Prompt-Limit-Reached": "true"}
        )
    
    # Get chat history
    history = await get_chat_history(session.id, db)
    
    # Get agent response
    agent = get_agent()
    response_text, tool_calls = await agent.chat(request.message, history)
    
    # Save messages
    user_msg = Message(session_id=session.id, role="user", content=request.message)
    assistant_msg = Message(session_id=session.id, role="assistant", content=response_text)
    db.add(user_msg)
    db.add(assistant_msg)
    
    remaining = await increment_prompt_count(session, user_id, db)
    
    return ChatResponse(
        message=response_text,
        session_id=session.id,
        prompt_count=session.prompt_count,
        remaining_prompts=remaining,
        tool_calls=tool_calls if tool_calls else None
    )


@router.post("/stream")
async def chat_stream(
    request: StreamChatRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Send a message and get a streaming response (SSE).
    """
    user_id = current_user["sub"] if current_user else None
    
    # Get or create session
    session = await get_or_create_session(request.session_id, user_id, db)
    
    # Check prompt limit
    allowed, remaining = await check_prompt_limit(session, user_id, db)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="limit_reached" if user_id else "login_required",
            headers={"X-Prompt-Limit-Reached": "true"}
        )
    
    # Get chat history
    history = await get_chat_history(session.id, db)
    
    async def generate() -> AsyncGenerator[str, None]:
        agent = get_agent()
        full_response = []
        tool_calls_made = []
        
        try:
            async for chunk in agent.chat_stream(request.message, history):
                if chunk["type"] == "thinking":
                    yield f"data: {json.dumps(chunk)}\n\n"
                
                elif chunk["type"] == "token":
                    full_response.append(chunk["content"])
                    yield f"data: {json.dumps(chunk)}\n\n"
                
                elif chunk["type"] == "tool_call":
                    yield f"data: {json.dumps(chunk)}\n\n"
                
                elif chunk["type"] == "tool_result":
                    tool_calls_made.append({
                        "tool": chunk["tool"],
                        "result": chunk["result"]
                    })
                    yield f"data: {json.dumps(chunk)}\n\n"
                
                elif chunk["type"] == "done":
                    user_msg = Message(session_id=session.id, role="user", content=request.message)
                    assistant_msg = Message(session_id=session.id, role="assistant", content="".join(full_response))
                    db.add(user_msg)
                    db.add(assistant_msg)
                    remaining = await increment_prompt_count(session, user_id, db)
                    
                    done_data = {
                        "type": "done",
                        "session_id": session.id,
                        "prompt_count": session.prompt_count,
                        "remaining_prompts": remaining,
                        "tool_calls": tool_calls_made if tool_calls_made else None
                    }
                    yield f"data: {json.dumps(done_data)}\n\n"
        
        except Exception as e:
            error_data = {"type": "error", "message": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/session/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get session info including prompt count."""
    result = await db.execute(
        select(Session).where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    if session.user_id:
        result2 = await db.execute(select(User).where(User.id == session.user_id))
        user = result2.scalar_one_or_none()
        if user and user.last_prompt_date == date.today():
            remaining = max(0, settings.max_daily_prompts - user.daily_prompt_count)
        else:
            remaining = settings.max_daily_prompts
    else:
        remaining = max(0, settings.max_anonymous_prompts - session.prompt_count)
    
    return SessionResponse(
        id=session.id,
        prompt_count=session.prompt_count,
        user_id=session.user_id,
        remaining_prompts=remaining
    )


@router.get("/history/{session_id}")
async def get_history(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get chat history for a session."""
    result = await db.execute(
        select(Session).where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    history = await get_chat_history(session_id, db)
    
    return {
        "session_id": session_id,
        "messages": history
    }
