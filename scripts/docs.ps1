# DragonFly – Docs dev server (Windows)
# Creates/activates venv, installs mkdocs-material, starts hot-reload server.
# Usage: .\scripts\docs.ps1

$ErrorActionPreference = "Stop"

$VenvDir = ".venv"
$VenvPython = "$VenvDir\Scripts\python.exe"
$VenvPip = "$VenvDir\Scripts\pip.exe"
$VenvMkdocs = "$VenvDir\Scripts\mkdocs.exe"

Write-Host "`n=== DragonFly – Docs ===" -ForegroundColor Cyan

# ── Python check ──────────────────────────────────────────────────────────────
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python not found. Install from https://python.org" -ForegroundColor Red
    exit 1
}

# ── venv ──────────────────────────────────────────────────────────────────────
if (!(Test-Path $VenvPython)) {
    Write-Host "[SETUP] Creating virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
    & $VenvPython -m pip install --upgrade pip -q
} else {
    Write-Host "[OK] venv exists" -ForegroundColor Green
}

# ── install / sync requirements ───────────────────────────────────────────────
Write-Host "[SETUP] Installing requirements..." -ForegroundColor Yellow
& $VenvPip install -q -r requirements-docs.txt

# ── launch ────────────────────────────────────────────────────────────────────
Write-Host "[START] Starting MkDocs at http://127.0.0.1:8001`n" -ForegroundColor Cyan
& $VenvMkdocs serve --dev-addr 127.0.0.1:8001
