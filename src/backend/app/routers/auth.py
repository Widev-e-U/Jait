"""
Authentication routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.models.database import get_db
from app.models.schemas import User, Session, UserResponse, TokenResponse
from app.auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
    oauth,
    verify_google_token,
    get_google_user_info
)
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleTokenRequest(BaseModel):
    """Request body for token-based Google auth (from @react-oauth/google)"""
    credential: str  # Google ID token


class SessionBindRequest(BaseModel):
    """Request to bind an anonymous session to a user"""
    session_id: str


@router.post("/google/token", response_model=TokenResponse)
async def google_token_auth(
    request: GoogleTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate using Google ID token (from @react-oauth/google frontend).
    Creates user if doesn't exist, returns JWT.
    """
    # Verify the Google token
    google_user = await verify_google_token(request.credential)
    if not google_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token"
        )
    
    # Find or create user
    result = await db.execute(
        select(User).where(User.google_id == google_user["google_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # Create new user
        user = User(
            email=google_user["email"],
            google_id=google_user["google_id"],
            name=google_user.get("name"),
            picture=google_user.get("picture")
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    # Create JWT token
    access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "name": user.name
    })
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user)
    )


@router.get("/google/login")
async def google_login(request: Request):
    """
    Initiate Google OAuth flow (server-side).
    Redirects to Google login page.
    """
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Google OAuth callback.
    Creates user if doesn't exist, returns JWT in redirect.
    """
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OAuth error: {str(e)}"
        )
    
    # Get user info
    google_user = await get_google_user_info(token["access_token"])
    if not google_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not get user info from Google"
        )
    
    # Find or create user
    result = await db.execute(
        select(User).where(User.google_id == google_user["google_id"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        user = User(
            email=google_user["email"],
            google_id=google_user["google_id"],
            name=google_user.get("name"),
            picture=google_user.get("picture")
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    # Create JWT
    access_token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "name": user.name
    })
    
    # Redirect to frontend with token
    frontend_url = settings.cors_origins[0] if settings.cors_origins else "http://localhost:3000"
    return RedirectResponse(f"{frontend_url}?token={access_token}")


@router.post("/session/bind")
async def bind_session(
    request: SessionBindRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Bind an anonymous session to the authenticated user.
    This preserves chat history after login.
    """
    result = await db.execute(
        select(Session).where(Session.id == request.session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    if session.user_id and session.user_id != current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Session belongs to another user"
        )
    
    session.user_id = current_user["sub"]
    await db.commit()
    
    return {"status": "ok", "session_id": session.id}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current authenticated user."""
    result = await db.execute(
        select(User).where(User.id == current_user["sub"])
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse.model_validate(user)
