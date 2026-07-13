param()
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Bureau of File Inspection - Dev Startup ===" -ForegroundColor Cyan
Write-Host ""

# Step 0: Check Docker Desktop is running
Write-Host "[0/4] Checking Docker Desktop..." -ForegroundColor Yellow
$dockerCheck = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Docker Desktop is not running." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor White
    Write-Host "  1. Open Docker Desktop from the Start menu or system tray" -ForegroundColor White
    Write-Host "  2. Wait for it to show 'Engine running'" -ForegroundColor White
    Write-Host "  3. Run this script again: .\dev.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}
Write-Host "      Docker Desktop is running" -ForegroundColor Green

# Step 1: Start Docker containers
Write-Host "[1/4] Starting Docker services (postgres, redis, clamav)..." -ForegroundColor Yellow
docker-compose up -d postgres redis clamav 2>&1 | Where-Object {
    $_ -match "Started|Created|Running|Healthy|error|Warning" -and $_ -notmatch "version.*obsolete"
} | ForEach-Object { Write-Host "      $_" }

# Step 2: Wait for PostgreSQL
Write-Host "[2/4] Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$maxTries = 30; $tries = 0; $ready = $false
while ($tries -lt $maxTries -and -not $ready) {
    $tries++
    try {
        $result = docker exec secure_upload_postgres pg_isready -U postgres 2>&1
        if ("$result" -match "accepting connections") {
            Write-Host "      PostgreSQL ready" -ForegroundColor Green
            $ready = $true
        }
    } catch {}
    if (-not $ready) { Start-Sleep -Seconds 2 }
}
if (-not $ready) {
    Write-Host "      ERROR: PostgreSQL did not start." -ForegroundColor Red
    Write-Host "      Run: docker logs secure_upload_postgres" -ForegroundColor Yellow
    exit 1
}

# Step 3: Wait for Redis
Write-Host "[3/4] Waiting for Redis to be ready..." -ForegroundColor Yellow
$tries = 0; $ready = $false
while ($tries -lt $maxTries -and -not $ready) {
    $tries++
    try {
        $result = docker exec secure_upload_redis redis-cli ping 2>&1
        if ("$result" -match "PONG") {
            Write-Host "      Redis ready" -ForegroundColor Green
            $ready = $true
        }
    } catch {}
    if (-not $ready) { Start-Sleep -Seconds 2 }
}
if (-not $ready) {
    Write-Host "      ERROR: Redis did not start." -ForegroundColor Red
    Write-Host "      Run: docker logs secure_upload_redis" -ForegroundColor Yellow
    exit 1
}

# Step 4: Launch all Node.js services
Write-Host "[4/4] Starting API, Worker, and Frontend..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  API      -> http://localhost:3000"  -ForegroundColor Yellow
Write-Host "  Frontend -> http://localhost:5173"  -ForegroundColor Magenta
Write-Host "  Login with any email + any password" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Gray
Write-Host ""

npm run dev
