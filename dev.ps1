$root = $PSScriptRoot

Write-Host "Starting database..." -ForegroundColor Yellow
docker compose -f "$root\docker-compose.yml" up db -d --wait

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\src\backend'; pyenv local 3.11.9; python -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\src\frontend'; npm run dev"

Write-Host "Started backend (http://localhost:8000) and frontend (http://localhost:3000)" -ForegroundColor Green
