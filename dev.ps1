$root = $PSScriptRoot

Write-Host "Starting database and Temporal..." -ForegroundColor Yellow
docker compose -f "$root\docker-compose.yml" up db temporal temporal-ui -d --wait

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\src\backend'; pyenv local 3.11.9; python -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\src\frontend'; npm run dev"

Write-Host @"

Services started:
  - Backend:     http://localhost:8000
  - Frontend:    http://localhost:3000
  - Temporal UI: http://localhost:8080

"@ -ForegroundColor Green
