"""
SQLAlchemy models and Pydantic schemas
"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, DateTime, Date, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pydantic import BaseModel, EmailStr, Field
from app.models.database import Base
import uuid


# SQLAlchemy Models
class User(Base):
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    google_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    picture: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    daily_prompt_count: Mapped[int] = mapped_column(Integer, default=0)
    last_prompt_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    sessions: Mapped[list["Session"]] = relationship(back_populates="user")
    scheduled_jobs: Mapped[list["ScheduledJob"]] = relationship(back_populates="user")


class Session(Base):
    __tablename__ = "sessions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    prompt_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped[Optional["User"]] = relationship(back_populates="sessions")
    messages: Mapped[list["Message"]] = relationship(back_populates="session")


class Message(Base):
    __tablename__ = "messages"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id"))
    role: Mapped[str] = mapped_column(String(20))  # user, assistant, tool
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    session: Mapped["Session"] = relationship(back_populates="messages")


class ScheduledJob(Base):
    """Scheduled cron job for agent tasks or system maintenance."""
    __tablename__ = "scheduled_jobs"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cron_expression: Mapped[str] = mapped_column(String(100))  # e.g., "0 * * * *" for hourly
    job_type: Mapped[str] = mapped_column(String(50))  # 'agent_task' or 'system'
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # For agent tasks
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON for system jobs
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Optional LLM provider
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Optional model override
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    temporal_schedule_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user: Mapped[Optional["User"]] = relationship(back_populates="scheduled_jobs")
    runs: Mapped[list["JobRun"]] = relationship(back_populates="job")


class JobRun(Base):
    """Record of a scheduled job execution."""
    __tablename__ = "job_runs"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("scheduled_jobs.id"))
    status: Mapped[str] = mapped_column(String(20))  # pending, running, completed, failed
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON result
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    job: Mapped["ScheduledJob"] = relationship(back_populates="runs")


# Pydantic Schemas
class UserCreate(BaseModel):
    email: EmailStr
    google_id: str
    name: Optional[str] = None
    picture: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    picture: Optional[str]
    
    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: str
    prompt_count: int
    user_id: Optional[str]
    remaining_prompts: Optional[int] = None
    
    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    session_id: str
    prompt_count: int
    remaining_prompts: Optional[int] = None
    tool_calls: Optional[list[dict]] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Scheduled Job Schemas
class ScheduledJobCreate(BaseModel):
    """Schema for creating a new scheduled job."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    cron_expression: str = Field(..., min_length=1, max_length=100)
    job_type: str = Field(default="agent_task")  # agent_task or system
    prompt: Optional[str] = None  # Required for agent_task
    payload: Optional[dict] = None  # For system jobs
    provider: Optional[str] = None
    model: Optional[str] = None
    enabled: bool = True


class ScheduledJobUpdate(BaseModel):
    """Schema for updating a scheduled job."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    cron_expression: Optional[str] = Field(None, min_length=1, max_length=100)
    prompt: Optional[str] = None
    payload: Optional[dict] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    enabled: Optional[bool] = None


class ScheduledJobResponse(BaseModel):
    """Schema for scheduled job response."""
    id: str
    user_id: Optional[str]
    name: str
    description: Optional[str]
    cron_expression: str
    job_type: str
    prompt: Optional[str]
    provider: Optional[str]
    model: Optional[str]
    enabled: bool
    temporal_schedule_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class JobRunResponse(BaseModel):
    """Schema for job run response."""
    id: str
    job_id: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    result: Optional[str]
    error: Optional[str]
    
    class Config:
        from_attributes = True


class JobRunListResponse(BaseModel):
    """Schema for paginated job run list."""
    items: list[JobRunResponse]
    total: int
    page: int
    size: int


class ScheduledJobListResponse(BaseModel):
    """Schema for paginated scheduled job list."""
    items: list[ScheduledJobResponse]
    total: int
    page: int
    size: int
