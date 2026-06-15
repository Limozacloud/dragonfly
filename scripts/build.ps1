# DragonFly – Release build (Windows → MSI + EXE)
# Run .\scripts\setup.ps1 first if this is a fresh machine.
# Usage: .\scripts\build.ps1 [-SkipFrontend] [-Debug]

param(
    [switch]$SkipFrontend,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

function Check-Command($name) { return !!(Get-Command $name -ErrorAction SilentlyContinue) }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host "`n=== DragonFly – Release Build (Windows) ===" -ForegroundColor Cyan
Write-Host "Version: $((Get-Content .\src-tauri\tauri.conf.json | ConvertFrom-Json).version)`n"

# ── LLVM in PATH (must happen before dependency check) ────────────────────────
$llvmBin = @("C:\Program Files\LLVM\bin","C:\LLVM\bin") |
    Where-Object { Test-Path "$_\clang.exe" } | Select-Object -First 1
if (!$llvmBin) { $llvmBin = Split-Path (Get-Command clang -ErrorAction SilentlyContinue).Source -ErrorAction SilentlyContinue }
if ($llvmBin) {
    $env:PATH = "$llvmBin;" + $env:PATH
    Write-Host "[OK] LLVM at $llvmBin" -ForegroundColor Green
}

# ── Dependency check ──────────────────────────────────────────────────────────
$missing = @()
if (!(Check-Command "node"))  { $missing += "Node.js" }
if (!(Check-Command "cargo")) { $missing += "Rust" }
if (!(Check-Command "cmake")) { $missing += "CMake" }
if (!(Check-Command "clang")) { $missing += "LLVM" }

if ($missing.Count -gt 0) {
    Write-Host "[WARN] Missing: $($missing -join ', ')" -ForegroundColor Yellow
    $choice = Read-Host "Run setup.ps1 to install missing dependencies? [Y/n]"
    if ($choice -notmatch '^[Nn]$') {
        & "$PSScriptRoot\setup.ps1"
    } else {
        Write-Host "[ERROR] Cannot continue without required tools." -ForegroundColor Red
        exit 1
    }
}

Write-Host "[OK] Node.js $(node --version)" -ForegroundColor Green
Write-Host "[OK] Rust $(rustc --version)" -ForegroundColor Green
Write-Host "[OK] CMake $(cmake --version | Select-Object -First 1)" -ForegroundColor Green

# ── BINDGEN_EXTRA_CLANG_ARGS ──────────────────────────────────────────────────
$includes = @()

$sdkInclude = @("${env:ProgramFiles(x86)}\Windows Kits\10\Include","${env:ProgramFiles}\Windows Kits\10\Include") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if ($sdkInclude) {
    $sdkVer = (Get-ChildItem $sdkInclude | Where-Object { $_.Name -match '^\d' } | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ucrt = "$sdkInclude\$sdkVer\ucrt"
    if (Test-Path $ucrt) { $includes += $ucrt }
}

if ($llvmBin) {
    $clangLib = Join-Path (Split-Path $llvmBin) "lib\clang"
    $clangVer = (Get-ChildItem $clangLib -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).Name
    $clangInc = "$clangLib\$clangVer\include"
    if (Test-Path $clangInc) { $includes += $clangInc }
}

$msvcBase = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($msvcBase) {
    $msvcVer = (Get-ChildItem $msvcBase | Sort-Object Name -Descending | Select-Object -First 1).Name
    $msvcInc = "$msvcBase\$msvcVer\include"
    if (Test-Path $msvcInc) { $includes += $msvcInc }
}

if ($includes.Count -eq 3) {
    $env:BINDGEN_EXTRA_CLANG_ARGS = ($includes | ForEach-Object { "-I`"$_`"" }) -join " "
    Write-Host "[OK] bindgen headers configured" -ForegroundColor Green
} else {
    Write-Host "[WARN] Some bindgen headers missing ($($includes.Count)/3) – run setup.ps1 if whisper-rs fails" -ForegroundColor Yellow
}

# ── npm install ───────────────────────────────────────────────────────────────
if (!(Test-Path "node_modules")) {
    Write-Host "[INSTALL] Running npm install..." -ForegroundColor Yellow
    npm install
}

# ── Frontend build ────────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Host "`n[1/2] Building frontend..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed!" -ForegroundColor Red; exit 1 }
    Write-Host "  Frontend OK" -ForegroundColor Green
} else {
    Write-Host "[1/2] Skipping frontend (reusing dist/)" -ForegroundColor DarkGray
}

# ── Tauri build ───────────────────────────────────────────────────────────────
$profile = if ($Debug) { "debug" } else { "release" }
Write-Host "[2/2] Building Tauri ($profile)..." -ForegroundColor Yellow

if ($Debug) {
    npx tauri build --debug --bundles msi
} else {
    npx tauri build --bundles msi
}
if ($LASTEXITCODE -ne 0) { Write-Host "Tauri build failed!" -ForegroundColor Red; exit 1 }

$sw.Stop()

# ── Output paths ──────────────────────────────────────────────────────────────
$msiDir = "src-tauri\target\$profile\bundle\msi"
if (Test-Path $msiDir) {
    $msi = Get-ChildItem $msiDir -Filter "*.msi" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($msi) { Write-Host "`n  MSI : $($msi.FullName)" -ForegroundColor Green }
}

$exePath = "src-tauri\target\$profile\DragonFly.exe"
if (Test-Path $exePath) {
    Write-Host "  EXE : $((Resolve-Path $exePath).Path)" -ForegroundColor Green
}

Write-Host "  Time: $([math]::Round($sw.Elapsed.TotalMinutes, 1)) min`n" -ForegroundColor DarkGray
