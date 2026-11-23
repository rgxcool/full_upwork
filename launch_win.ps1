#Requires -Version 5.1
$ErrorActionPreference = "Stop"
function Write-Log([string]$msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg)  { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg)   { Write-Host "[X] $msg" -ForegroundColor Red }
$Root = $PSScriptRoot
$BackendPort = 5010
$FrontendPort = 5173
$MongoPort = 27017
$EnvFile = Join-Path $Root "backend\.env.development"
if (Test-Path $EnvFile) {
    $content = Get-Content $EnvFile -Raw
    if ($content -match '(?m)^PORT=([0-9]+)') {
        $BackendPort = [int]$Matches[1]
        Write-Log "Using PORT=$BackendPort from backend/.env.development"
    }
}
if (Test-Path $EnvFile) {
    $content = Get-Content $EnvFile -Raw
    if ($content -match 'REPLACE_WITH_GENERATED_SECRET') {
        $secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        $content = $content -replace 'REPLACE_WITH_GENERATED_SECRET_MIN_32_CHARS',$secret.Trim()
        Set-Content -Path $EnvFile -Value$content
        Write-Log "Generated new JWT_SECRET"
    }
}
$mongoRunning =$false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 27017)
    $tcp.Close()
    $mongoRunning =$true
} catch {}
if ($mongoRunning) {
    Write-Log "MongoDB already running on port $MongoPort"
} elseif (Get-Command mongod -ErrorAction SilentlyContinue) {
    Write-Warn "Starting MongoDB..."
    $dataDir = "$env:USERPROFILE\mongo-data"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path$dataDir | Out-Null }
    Start-Process mongod -ArgumentList "--dbpath `"$dataDir`" --bind_ip 127.0.0.1" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Log "MongoDB started on port $MongoPort"
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerRunning =$false
    try { docker info *>&1 | Out-Null; $dockerRunning =$true } catch {}
    if ($dockerRunning) {
        $containers = docker ps --format '{{.Names}}'
        if ($containers -match 'mindful_mongo') {
            Write-Log "MongoDB container already running"
        } else {
            Write-Warn "Starting MongoDB via Docker..."
            docker compose -f "$Root\docker-compose.yml" up -d mongo
            Start-Sleep -Seconds 3
            Write-Log "MongoDB started via Docker"
        }
        $MongoPort = 27018
    } else {
        Write-Err "No running MongoDB, mongod binary, or Docker found. Start MongoDB manually and retry."
        exit 1
    }
} else {
    Write-Err "No running MongoDB, mongod binary, or Docker found. Start MongoDB manually and retry."
    exit 1
}
Write-Log "Checking dependencies..."
if (-not (Test-Path "$Root\node_modules")) {
    Write-Warn "Installing root dependencies..."
    Push-Location $Root
    pnpm install --frozen-lockfile 2>$null; if ($LASTEXITCODE -ne 0) { pnpm install }
    Pop-Location
}
if (-not (Test-Path "$Root\backend\node_modules")) {
    Write-Warn "Installing backend dependencies..."
    Push-Location "$Root\backend"
    pnpm install --frozen-lockfile 2>$null; if ($LASTEXITCODE -ne 0) { pnpm install }
    Pop-Location
}
if (-not (Test-Path "$Root\frontend\node_modules")) {
    Write-Warn "Installing frontend dependencies..."
    Push-Location "$Root\frontend"
    pnpm install --frozen-lockfile 2>$null; if ($LASTEXITCODE -ne 0) { pnpm install }
    Pop-Location
}
Write-Log "Dependencies ready"
Write-Log "Loading education data (dropEducation + updateEducation)..."
try {
    Push-Location "$Root\backend"
    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match '^\s*([^#\s][^=]*)=(.*)$') {
                [Environment]::SetEnvironmentVariable($Matches[1].Trim(),$Matches[2].Trim(), 'Process')
            }
        }
    }
    node scripts/dropEducation.js
    node scripts/updateEducation.js "../data/Kurser och kurspaket GY25.xlsx"
    node scripts/seedE2EData.js
    node scripts/seedMindfulFaq.js
    Pop-Location
    Write-Log "Education data loaded"
} catch {
    Pop-Location
    Write-Err "Failed to load education data. Check the script output above."
    exit 1
}
foreach ($port in @($BackendPort,$FrontendPort)) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $pidToKill =$conn.OwningProcess
        if ($pidToKill) {
            Write-Warn "Killing process on port $port (PID$pidToKill)"
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }
}
Write-Log "Starting backend on port $BackendPort..."
$backendLog = "$Root\backend.log"
$backendProcess = Start-Process node -ArgumentList "index.js" -WorkingDirectory "$Root\backend" -RedirectStandardOutput $backendLog -PassThru
Start-Sleep -Seconds 3
if (!$backendProcess.HasExited) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$BackendPort/health/live" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Log "Backend running (PID $($backendProcess.Id)) -> http://localhost:$BackendPort"
        } else {
            Write-Warn "Backend started but health check pending..."
        }
    } catch {
        Write-Warn "Backend started but health check pending..."
    }
} else {
    Write-Err "Backend failed to start. Check $Root\backend.log"
    if (Test-Path $backendLog) { Get-Content $backendLog -Tail 20 }
    exit 1
}
Write-Log "Starting frontend on port $FrontendPort..."
$frontendLog = "$Root\frontend.log"
$frontendProcess = Start-Process cmd -ArgumentList "/c npx vite --host > `"$frontendLog`" 2>&1" -WorkingDirectory "$Root\frontend" -PassThru
Start-Sleep -Seconds 4
if (!$frontendProcess.HasExited) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$FrontendPort" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Log "Frontend running (PID $($frontendProcess.Id)) -> http://localhost:$FrontendPort"
        } else {
            Write-Warn "Frontend started but still compiling..."
        }
    } catch {
        Write-Warn "Frontend started but still compiling..."
    }
} else {
    Write-Err "Frontend failed to start. Check $Root\frontend.log"
    if (Test-Path $frontendLog) { Get-Content$frontendLog -Tail 20 }
    exit 1
}
Write-Host ""
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Mindful Learning - App is running!" -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend:  " -NoNewline; Write-Host "http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "  Backend:   " -NoNewline; Write-Host "http://localhost:$BackendPort" -ForegroundColor Green
Write-Host "  MongoDB:   " -NoNewline; Write-Host "localhost:$MongoPort" -ForegroundColor Green
Write-Host ""
Write-Host ""
Write-Host "  Logs:      $Root\backend.log"
Write-Host "             $Root\frontend.log"
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($backendProcess.HasExited -or$frontendProcess.HasExited) {
            Write-Warn "One of the services stopped unexpectedly."
            break
        }
    }
} finally {
    Write-Host ""
    Write-Warn "Shutting down..."
    if ($backendProcess -and !$backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($frontendProcess -and !$frontendProcess.HasExited) { Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue }
    Write-Log "Stopped"
}
