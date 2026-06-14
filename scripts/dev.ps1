# DragonFly – Dev startup (Windows)
# Launches the app with hot reload. Run .\scripts\setup.ps1 first if this is a fresh machine.
# Usage: .\scripts\dev.ps1

$ErrorActionPreference = "Stop"

function Check-Command($name) { return !!(Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host "`n=== DragonFly – Dev ===" -ForegroundColor Cyan

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

# ── LLVM in PATH ──────────────────────────────────────────────────────────────
$llvmBin = Get-ChildItem "C:\Program Files\LLVM\bin","C:\LLVM\bin" -ErrorAction SilentlyContinue |
    Where-Object { Test-Path "$($_.FullName)\clang.exe" } | Select-Object -First 1 -ExpandProperty FullName
if (!$llvmBin) { $llvmBin = Split-Path (Get-Command clang -ErrorAction SilentlyContinue).Source }
if ($llvmBin) {
    $env:PATH = "$llvmBin;" + $env:PATH
    Write-Host "[OK] LLVM at $llvmBin" -ForegroundColor Green
}

# ── BINDGEN_EXTRA_CLANG_ARGS ──────────────────────────────────────────────────
$includes = @()

# Windows SDK ucrt (stdio.h)
$sdkInclude = @("${env:ProgramFiles(x86)}\Windows Kits\10\Include","${env:ProgramFiles}\Windows Kits\10\Include") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if ($sdkInclude) {
    $sdkVer = (Get-ChildItem $sdkInclude | Where-Object { $_.Name -match '^\d' } | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ucrt = "$sdkInclude\$sdkVer\ucrt"
    if (Test-Path $ucrt) { $includes += $ucrt }
}

# LLVM clang built-in headers (stdbool.h, stdint.h)
if ($llvmBin) {
    $clangLib = Join-Path (Split-Path $llvmBin) "lib\clang"
    $clangVer = (Get-ChildItem $clangLib -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).Name
    $clangInc = "$clangLib\$clangVer\include"
    if (Test-Path $clangInc) { $includes += $clangInc }
}

# MSVC headers (vcruntime.h)
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
} else {
    Write-Host "[OK] node_modules present" -ForegroundColor Green
}

# ── Launch ────────────────────────────────────────────────────────────────────
Write-Host "`n[START] Launching DragonFly (hot reload)...`n" -ForegroundColor Cyan
npm run dev:tauri
