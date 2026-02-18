"""
Pytest fixtures for testing Jait backend
"""
import pytest
import asyncio
from typing import AsyncGenerator, Generator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import AsyncMock, patch

from app.main import app
from app.models.database import Base, get_db
from app.models.schemas import User
from app.auth.jwt import create_access_token
from app.config import get_settings


# Test database URL (SQLite in-memory)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture(scope="function")
async def test_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    TestSessionLocal = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture(scope="function")
async def test_user(test_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        id="test-user-id-123",
        email="test@example.com",
        google_id="google-123",
        name="Test User",
        picture="https://example.com/avatar.jpg",
    )
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def auth_token(test_user: User) -> str:
    """Create a valid JWT token for the test user."""
    return create_access_token({
        "sub": test_user.id,
        "email": test_user.email,
        "name": test_user.name,
    })


@pytest.fixture(scope="function")
def auth_headers(auth_token: str) -> dict:
    """Get authorization headers with test token."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="function")
async def mock_temporal():
    """Mock Temporal client functions."""
    with patch("app.routers.jobs.create_schedule", new_callable=AsyncMock) as mock_create, \
         patch("app.routers.jobs.delete_schedule", new_callable=AsyncMock) as mock_delete, \
         patch("app.routers.jobs.pause_schedule", new_callable=AsyncMock) as mock_pause, \
         patch("app.routers.jobs.unpause_schedule", new_callable=AsyncMock) as mock_unpause, \
         patch("app.routers.jobs.trigger_schedule", new_callable=AsyncMock) as mock_trigger:
        
        yield {
            "create_schedule": mock_create,
            "delete_schedule": mock_delete,
            "pause_schedule": mock_pause,
            "unpause_schedule": mock_unpause,
            "trigger_schedule": mock_trigger,
        }


@pytest.fixture(scope="function")
async def client(test_engine, test_user, mock_temporal) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with test database and mocked Temporal."""
    
    # Override the database dependency
    TestSessionLocal = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async def override_get_db():
        async with TestSessionLocal() as session:
            try:
                yield session
            finally:
                await session.close()
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    
    app.dependency_overrides.clear()


# Helper fixtures for creating test data
@pytest.fixture
def sample_job_data():
    """Sample job creation data."""
    return {
        "name": "Test Agent Task",
        "description": "A test scheduled job",
        "cron_expression": "0 * * * *",
        "job_type": "agent_task",
        "prompt": "What's the weather like today?",
        "provider": "ollama",
        "model": "qwen2.5:7b",
        "enabled": True,
    }


@pytest.fixture
def sample_system_job_data():
    """Sample system job creation data."""
    return {
        "name": "Test System Job",
        "description": "A test system maintenance job",
        "cron_expression": "0 0 * * *",
        "job_type": "system",
        "payload": {"action": "cleanup", "days": 30},
        "enabled": True,
    }
