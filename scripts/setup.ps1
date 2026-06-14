# DragonFly – Environment Setup (Windows)
# Installs all build dependencies for DragonFly development.
# Run once before using dev.ps1 or build.ps1.
# Usage: .\scripts\setup.ps1

$ErrorActionPreference = "Stop"

function Check-Command($name) { return !!(Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host "`n=== DragonFly – Environment Setup ===" -ForegroundColor Cyan

# ── Package manager ───────────────────────────────────────────────────────────
$useChoco = $false
if (Check-Command "winget") {
    Write-Host "[OK] Package manager: winget" -ForegroundColor Green
} elseif (Check-Command "choco") {
    $useChoco = $true
    Write-Host "[OK] Package manager: Chocolatey" -ForegroundColor Green
} else {
    Write-Host "`nNeither winget nor Chocolatey found." -ForegroundColor Yellow
    $choice = Read-Host "Install Chocolatey now? [y/N]"
    if ($choice -match '^[Yy]$') {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        $useChoco = $true
        Write-Host "[OK] Chocolatey installed" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] A package manager is required. Install winget (App Installer) from the Microsoft Store or Chocolatey from https://chocolatey.org" -ForegroundColor Red
        exit 1
    }
}

function Install-Package($wingetId, $chocoId, $label) {
    Write-Host "[INSTALL] $label..." -ForegroundColor Yellow
    if ($useChoco) {
        choco install $chocoId -y
    } else {
        winget install $wingetId --silent --accept-package-agreements --accept-source-agreements
    }
}

# ── Node.js ───────────────────────────────────────────────────────────────────
if (Check-Command "node") {
    Write-Host "[OK] Node.js $(node --version)" -ForegroundColor Green
} else {
    Install-Package "OpenJS.NodeJS.LTS" "nodejs-lts" "Node.js LTS"
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-Host "[OK] Node.js installed" -ForegroundColor Green
}

# ── Rust ──────────────────────────────────────────────────────────────────────
if (Check-Command "cargo") {
    Write-Host "[OK] Rust $(rustc --version)" -ForegroundColor Green
} else {
    Write-Host "[INSTALL] Rust (rustup)..." -ForegroundColor Yellow
    $rustupInstaller = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest "https://win.rustup.rs/x86_64" -OutFile $rustupInstaller
    & $rustupInstaller -y --default-toolchain stable
    $env:PATH += ";$env:USERPROFILE\.cargo\bin"
    Write-Host "[OK] Rust installed" -ForegroundColor Green
}

# ── CMake ─────────────────────────────────────────────────────────────────────
if (Check-Command "cmake") {
    Write-Host "[OK] CMake $(cmake --version | Select-Object -First 1)" -ForegroundColor Green
} else {
    Install-Package "Kitware.CMake" "cmake" "CMake"
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + $env:PATH
    Write-Host "[OK] CMake installed" -ForegroundColor Green
}

# ── LLVM ──────────────────────────────────────────────────────────────────────
$llvmBin = Get-ChildItem "C:\Program Files\LLVM\bin","C:\LLVM\bin" -ErrorAction SilentlyContinue |
    Where-Object { Test-Path "$($_.FullName)\clang.exe" } | Select-Object -First 1 -ExpandProperty FullName

if (!$llvmBin -and (Check-Command "clang")) {
    $llvmBin = Split-Path (Get-Command clang).Source
}

if ($llvmBin) {
    Write-Host "[OK] LLVM at $llvmBin" -ForegroundColor Green
} else {
    Install-Package "LLVM.LLVM" "llvm" "LLVM"
    # Refresh PATH and recheck
    $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $llvmBin = Get-ChildItem "C:\Program Files\LLVM\bin","C:\LLVM\bin" -ErrorAction SilentlyContinue |
        Where-Object { Test-Path "$($_.FullName)\clang.exe" } | Select-Object -First 1 -ExpandProperty FullName
    if ($llvmBin) {
        Write-Host "[OK] LLVM installed at $llvmBin" -ForegroundColor Green
    } else {
        Write-Host "[WARN] LLVM installed – restart this terminal and re-run setup if the build fails." -ForegroundColor Yellow
    }
}

# ── VS BuildTools with C++ workload (MSVC + Windows SDK) ─────────────────────
# Needed by whisper-rs bindgen for vcruntime.h, stdio.h, etc.
# VS 2022 can live in ProgramFiles (Community) or ProgramFiles(x86) (BuildTools)
$msvcFound = @(
    "$env:ProgramFiles\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Professional\VC\Tools\MSVC",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\Enterprise\VC\Tools\MSVC"
) | Where-Object { Test-Path $_ -PathType Container } |
    Where-Object { (Get-ChildItem $_ -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0 } |
    Select-Object -First 1

if ($msvcFound) {
    $msvcVer = (Get-ChildItem $msvcFound | Sort-Object Name -Descending | Select-Object -First 1).Name
    Write-Host "[OK] MSVC $msvcVer" -ForegroundColor Green
} else {
    Write-Host "[INSTALL] VS BuildTools 2022 with C++ workload..." -ForegroundColor Yellow
    if ($useChoco) {
        choco install visualstudio2022buildtools -y --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"
    } else {
        winget install Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements `
            --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --norestart"
    }
    Write-Host "[OK] VS BuildTools installed" -ForegroundColor Green
}

# ── BINDGEN / clang include paths (required by whisper-rs-sys) ───────────────
# bindgen uses clang to parse C headers. On Windows, clang needs explicit paths
# to the Windows SDK (ucrt/stdio.h etc.) and MSVC headers.
Write-Host "[CHECK] Configuring bindgen include paths..." -ForegroundColor Yellow

$sdkInclude = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\Include" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName

$msvcInclude = $null
@(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC"
) | ForEach-Object {
    if (!$msvcInclude -and (Test-Path $_)) {
        $ver = Get-ChildItem $_ -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if ($ver) { $msvcInclude = "$_\$($ver.Name)\include" }
    }
}

if ($sdkInclude -and $msvcInclude) {
    $llvmLib = "C:\Program Files\LLVM\lib"
    $bindgenArgs = @(
        "-I`"$sdkInclude\ucrt`"",
        "-I`"$sdkInclude\um`"",
        "-I`"$sdkInclude\shared`"",
        "-I`"$msvcInclude`""
    ) -join " "

    [System.Environment]::SetEnvironmentVariable("LIBCLANG_PATH", $llvmLib, "User")
    [System.Environment]::SetEnvironmentVariable("BINDGEN_EXTRA_CLANG_ARGS", $bindgenArgs, "User")
    $env:LIBCLANG_PATH = $llvmLib
    $env:BINDGEN_EXTRA_CLANG_ARGS = $bindgenArgs
    Write-Host "[OK] LIBCLANG_PATH and BINDGEN_EXTRA_CLANG_ARGS set" -ForegroundColor Green
} else {
    Write-Host "[WARN] Could not auto-detect SDK/MSVC paths for bindgen." -ForegroundColor Yellow
    Write-Host "       SDK: $sdkInclude  MSVC: $msvcInclude" -ForegroundColor Yellow
    Write-Host "       whisper-rs may fail to build. Set BINDGEN_EXTRA_CLANG_ARGS manually." -ForegroundColor Yellow
}

Write-Host "`n[DONE] All dependencies installed." -ForegroundColor Cyan
Write-Host "       You can now run:  .\scripts\dev.ps1`n" -ForegroundColor White
