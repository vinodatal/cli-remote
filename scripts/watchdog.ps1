# Copilot Session Portal — Watchdog
# Checks if portal + tunnel are running, restarts if not.

$ProjectDir = Split-Path -Parent $PSScriptRoot
$Port = 3456
$TunnelName = "copilot-portal"
$LogDir = Join-Path $ProjectDir "logs"
$LogFile = Join-Path $LogDir "watchdog.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

# ── Check Portal ──
$portalUp = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/stats" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $portalUp = $true }
} catch {}

if ($portalUp) {
    Log "Portal OK (port $Port)"
} else {
    Log "Portal DOWN — restarting..."

    # Kill anything on our port
    $listening = netstat -aon | Select-String ":$Port\s" | Select-String "LISTENING"
    foreach ($line in $listening) {
        $pid = ($line -split '\s+')[-1]
        if ($pid -match '^\d+$') {
            Log "Killing PID $pid on port $Port"
            Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
        }
    }

    # Rebuild native modules if needed
    Set-Location $ProjectDir
    try { node -e "require('better-sqlite3')" 2>$null } catch {
        Log "Rebuilding native modules..."
        npm rebuild 2>&1 | Out-Null
    }

    # Start portal
    Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "server.log") -RedirectStandardError (Join-Path $LogDir "server-err.log")
    Log "Portal started"

    Start-Sleep -Seconds 5
}

# ── Check Tunnel ──
$tunnelUp = Get-Process devtunnel -ErrorAction SilentlyContinue

if ($tunnelUp) {
    Log "Tunnel OK (PID $($tunnelUp.Id))"
} else {
    Log "Tunnel DOWN — restarting..."
    Start-Process -FilePath "devtunnel" -ArgumentList "host $TunnelName" -WindowStyle Hidden
    Log "Tunnel started"
}
