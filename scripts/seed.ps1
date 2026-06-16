# DragonFly – Seed dummy data into the local dev SQLite database
# Usage: .\scripts\seed.ps1
# Requires: sqlite3.exe in PATH
#           Install via: winget install SQLite.SQLite

$ErrorActionPreference = "Stop"

Write-Host "`n=== DragonFly – Seed Data ===" -ForegroundColor Cyan

# ── Find SQLite (auto-install if missing) ────────────────────────────────────
if (!(Get-Command "sqlite3" -ErrorAction SilentlyContinue)) {
    Write-Host "[INSTALL] sqlite3 not found – installing..." -ForegroundColor Yellow
    if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        winget install SQLite.SQLite --silent --accept-package-agreements --accept-source-agreements
    } elseif (Get-Command "choco" -ErrorAction SilentlyContinue) {
        choco install sqlite -y
    } else {
        Write-Host "[ERROR] No package manager found (winget or Chocolatey required)." -ForegroundColor Red
        Write-Host "        Install sqlite3 manually from https://www.sqlite.org/download.html" -ForegroundColor Yellow
        exit 1
    }
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (!(Get-Command "sqlite3" -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] sqlite3 still not found after install. Restart this terminal and re-run." -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] sqlite3 installed" -ForegroundColor Green
}

# ── Find the DEV database ─────────────────────────────────────────────────────
# tauri.dev.conf.json uses identifier "dragonfly-dev" — never touches production.
$dbPath = "$env:APPDATA\dragonfly-dev\dragonfly.db"
if (!(Test-Path $dbPath)) {
    Write-Host "[ERROR] Dev database not found at: $dbPath" -ForegroundColor Red
    Write-Host "        Launch DragonFly in dev mode first:  npm run dev:tauri" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Database: $dbPath" -ForegroundColor Green

# ── Choose seed set ───────────────────────────────────────────────────────────
Write-Host @"

Which seed set do you want to insert?

  [1] Alpha + Beta   – Main dev project & experimental features
  [2] Gamma + Delta  – Mobile app & data analytics (simulates PC2)

"@ -ForegroundColor White

$choice = Read-Host "Choose [1/2]"

switch ($choice) {
    '1' {
        $seedFile = Join-Path $PSScriptRoot "seed-alpha-beta.sql"
        $label = "Alpha + Beta"
        $summary = @"
  - 2 projects (Alpha, Beta)
  - 5 users
  - 5 releases
  - 19 tasks
  - 9 notes (with hierarchy)
  - 3 scratchpads
  - 7 personal todos
"@
    }
    '2' {
        $seedFile = Join-Path $PSScriptRoot "seed-gamma-delta.sql"
        $label = "Gamma + Delta"
        $summary = @"
  - 2 projects (Gamma, Delta)
  - 5 users
  - 5 releases
  - 19 tasks
  - 7 notes (with hierarchy)
  - 3 scratchpads
  - 5 personal todos
"@
    }
    default {
        Write-Host "Invalid choice. Aborted." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host @"

This will INSERT $label dummy data:
$summary
Existing rows with the same ID are skipped (INSERT OR IGNORE).
Your existing data will NOT be deleted.

"@ -ForegroundColor White

$confirm = Read-Host "Continue? [y/N]"
if ($confirm -notmatch '^[Yy]$') {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

# ── Apply seed SQL ────────────────────────────────────────────────────────────
Write-Host "[...] Applying $label seed data..." -ForegroundColor Yellow

Get-Content $seedFile | sqlite3 $dbPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] sqlite3 returned exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "[DONE] $label seed data inserted successfully." -ForegroundColor Green
Write-Host "       Restart DragonFly to see the data.`n" -ForegroundColor White
