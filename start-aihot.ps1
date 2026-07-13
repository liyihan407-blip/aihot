$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"
$port = $env:PORT

if (-not $port -and (Test-Path -LiteralPath $envFile)) {
  $portLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
  if ($portLine) {
    $port = ($portLine -replace '^\s*PORT\s*=\s*', '').Trim().Trim('"').Trim([char]39)
  }
}

if (-not $port) {
  $port = "8787"
}

$url = "http://localhost:$port"

function Test-AIHotUrl {
  param([string]$TargetUrl)

  try {
    $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (Test-AIHotUrl -TargetUrl $url) {
  Write-Host "AIHot is already running. Opening: $url"
  Start-Process $url
  Start-Sleep -Seconds 2
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found. Please install Node.js 18 or newer, then run this again."
  exit 1
}

$escapedRoot = $root.Replace("'", "''")
$serverCommand = "Set-Location -LiteralPath '$escapedRoot'; node server.js"

Write-Host "Starting AIHot..."
Write-Host "Page URL: $url"
Write-Host "A server window will open. Keep it open; close it to stop AIHot."

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $serverCommand
) -WorkingDirectory $root

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  if (Test-AIHotUrl -TargetUrl $url) {
    Write-Host "AIHot is ready. Opening browser."
    Start-Process $url
    Start-Sleep -Seconds 2
    exit 0
  }

  Start-Sleep -Milliseconds 500
}

Write-Host "The server is starting but did not respond yet. You can open this URL manually: $url"
Start-Process $url
Start-Sleep -Seconds 2
