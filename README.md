# Agent Chat

A ChatGPT-style AI agent interface powered by Qwen via Ollama. Features tool calling, Google authentication, and a clean React frontend.

## Features

- **Tool-enabled Agent**: Calculator, datetime, Python eval, web search (stub)
- **Streaming Responses**: Real-time SSE streaming from the agent
- **Google OAuth**: Sign in with Google for unlimited access
- **Prompt Limiting**: 5 free prompts for anonymous users
- **Docker Ready**: Development and production configurations

## Tech Stack

- **Backend**: FastAPI + Uvicorn + SQLAlchemy (async)
- **Frontend**: React + Vite + shadcn/ui
- **Database**: PostgreSQL
- **LLM**: Qwen via Ollama
- **Auth**: Google OAuth 2.0 + JWT

## Quick Start

### Prerequisites

1. **Ollama** with Qwen model:
   ```bash
   # Install Ollama from https://ollama.ai
   ollama pull qwen2.5:7b
   ollama serve  # Start Ollama server
   ```

2. **Docker & Docker Compose** (optional, for containerized setup)

3. **Google OAuth Credentials** (optional, for login feature):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add `http://localhost:8000/auth/google/callback` as authorized redirect URI

### Local Development

#### Option 1: Docker Compose (Recommended)

```bash
# Copy environment files
cp src/backend/.env.example src/backend/.env
cp src/frontend/.env.example src/frontend/.env

# Edit .env files with your Google OAuth credentials (optional)

# Start all services
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

#### Option 2: Manual Setup

**Backend:**
```bash
cd src/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Copy and edit environment
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd src/frontend

# Install dependencies
npm install

# Copy and edit environment
cp .env.example .env

# Start dev server
npm run dev
```

## Production Deployment

### Docker Swarm

1. Create `agent.env` from `agent.env.example`
2. Deploy the stack:
   ```bash
   docker stack deploy -c docker-stack.yml agent
   ```

### GitHub Actions

The repository includes a GitHub Actions workflow that:
- Builds Docker images on push to `main`
- Pushes to GitHub Container Registry (ghcr.io)
- Optionally triggers deployment via webhook

Set these GitHub repository variables:
- `VITE_API_URL`: Your backend API URL
- `VITE_GOOGLE_CLIENT_ID`: Google OAuth client ID

Set these GitHub secrets (optional):
- `DEPLOY_WEBHOOK_URL`: Webhook to trigger deployment

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/health` | GET | Detailed health check |
| `/chat` | POST | Send message (non-streaming) |
| `/chat/stream` | POST | Send message (SSE streaming) |
| `/chat/session/{id}` | GET | Get session info |
| `/chat/history/{id}` | GET | Get chat history |
| `/auth/google/token` | POST | Google token auth |
| `/auth/google/login` | GET | Initiate OAuth flow |
| `/auth/google/callback` | GET | OAuth callback |
| `/auth/me` | GET | Get current user |

## Agent Tools

The agent has access to these tools:

- **get_datetime**: Get current date/time
- **calculator**: Evaluate math expressions
- **python_eval**: Execute Python expressions
- **web_search**: Search the web (stub - integrate your own)
- **generate_text**: Text transformation hint

## Project Structure

```
├── src/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── agent/        # Agent core, tools, prompts
│   │   │   ├── auth/         # JWT & Google OAuth
│   │   │   ├── models/       # SQLAlchemy models
│   │   │   ├── routers/      # API routes
│   │   │   ├── config.py     # Settings
│   │   │   └── main.py       # FastAPI app
│   │   ├── alembic/          # DB migrations
│   │   └── Dockerfile
│   └── frontend/
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── hooks/        # Custom hooks
│       │   └── App.tsx       # Main app
│       └── Dockerfile
├── docker-compose.yml        # Local development
├── docker-stack.yml          # Production (Swarm)
└── .github/workflows/        # CI/CD
```

## License

MIT
