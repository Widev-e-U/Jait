# Jait Testing

This document describes the testing infrastructure for the Jait project.

## Backend Tests (Python/pytest)

Backend integration tests are located in `src/backend/tests/`.

### Setup

```bash
cd src/backend
pip install -r requirements.txt  # Includes test dependencies
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_jobs_api.py

# Run specific test class
pytest tests/test_jobs_api.py::TestCreateJob

# Run with verbose output
pytest -v
```

### Test Structure

- `tests/conftest.py` - Shared fixtures
  - `test_engine` - In-memory SQLite database
  - `test_session` - Database session for tests
  - `test_user` - Pre-created test user
  - `auth_token` / `auth_headers` - JWT authentication
  - `mock_temporal` - Mocked Temporal client functions
  - `client` - Async HTTP test client

- `tests/test_jobs_api.py` - Jobs API integration tests
  - CRUD operations for scheduled jobs
  - Authentication/authorization tests
  - Temporal integration tests (mocked)

## End-to-End Tests (Playwright)

E2E tests are located in the `e2e/` directory.

### Setup

```bash
cd e2e
npm install
npx playwright install
```

### Running Tests

```bash
# Run all E2E tests
npm test

# Run in headed mode (see the browser)
npm run test:headed

# Run with Playwright UI
npm run test:ui

# Run in debug mode
npm run test:debug

# View HTML report
npm run test:report

# Generate tests with codegen
npm run codegen
```

### Test Structure

- `e2e/tests/fixtures.ts` - Authentication fixtures and helpers
- `e2e/tests/jobs.spec.ts` - Jobs UI E2E tests
  - Page navigation
  - Create/edit/delete job flows
  - Job card actions
  - History dialog
  - Responsive layout

### Configuration

- `e2e/playwright.config.ts` - Playwright configuration
  - Browser configurations (Chromium, Firefox, WebKit)
  - Mobile viewports
  - Web server setup for dev mode

### Environment Variables

- `FRONTEND_URL` - Frontend URL (default: http://localhost:5173)
- `API_URL` - Backend API URL (default: http://localhost:8000)

## Test Endpoints

The backend exposes test-only endpoints when running in debug mode (`DEBUG=true`):

- `POST /auth/test/token` - Create a test user and get a JWT token
  - Request body: `{ id, email, name, picture? }`
  - Returns: `{ access_token, user }`

## Continuous Integration

Tests can be run in CI with:

```yaml
# Backend tests
- name: Run backend tests
  run: |
    cd src/backend
    pip install -r requirements.txt
    pytest --cov=app --cov-report=xml

# E2E tests
- name: Run E2E tests
  run: |
    cd e2e
    npm ci
    npx playwright install --with-deps
    npm test
```

## Writing New Tests

### Backend Tests

```python
import pytest
from httpx import AsyncClient

class TestNewFeature:
    async def test_something(self, client: AsyncClient, auth_headers: dict):
        response = await client.get("/endpoint", headers=auth_headers)
        assert response.status_code == 200
```

### E2E Tests

```typescript
import { test, expect } from './fixtures'

test.describe('New Feature', () => {
  test('should do something', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    await expect(authenticatedPage.locator('text=Expected')).toBeVisible()
  })
})
```
