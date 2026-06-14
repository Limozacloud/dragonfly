#!/usr/bin/env bash
# DragonFly – Dev startup (Linux / macOS)
# Checks all dependencies, installs missing ones, then launches the app with hot reload.
# Usage: ./scripts/dev.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}=== DragonFly – Dev Setup ===${NC}"

OS="$(uname -s)"

# ── System packages (Linux only) ──────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
    PKGS=()
    dpkg -s libwebkit2gtk-4.1-dev &>/dev/null || PKGS+=("libwebkit2gtk-4.1-dev")
    dpkg -s libclang-dev &>/dev/null           || PKGS+=("libclang-dev")
    dpkg -s cmake &>/dev/null                  || PKGS+=("cmake")
    dpkg -s build-essential &>/dev/null        || PKGS+=("build-essential")
    dpkg -s libgtk-3-dev &>/dev/null           || PKGS+=("libgtk-3-dev")
    dpkg -s librsvg2-dev &>/dev/null           || PKGS+=("librsvg2-dev")
    dpkg -s libayatana-appindicator3-dev &>/dev/null || PKGS+=("libayatana-appindicator3-dev")

    if [[ ${#PKGS[@]} -gt 0 ]]; then
        echo -e "${YELLOW}[INSTALL] Missing system packages: ${PKGS[*]}${NC}"
        sudo apt-get update -qq
        sudo apt-get install -y "${PKGS[@]}"
    else
        echo -e "${GREEN}[OK] System packages present${NC}"
    fi
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo -e "${YELLOW}[INSTALL] Node.js not found – installing via nvm...${NC}"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
else
    echo -e "${GREEN}[OK] Node.js $(node --version)${NC}"
fi

# ── Rust ──────────────────────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
    echo -e "${YELLOW}[INSTALL] Rust not found – installing rustup...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    source "$HOME/.cargo/env"
else
    echo -e "${GREEN}[OK] Rust $(rustc --version)${NC}"
fi

# Source cargo env in case it was just installed
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# ── LIBCLANG_PATH (Linux) ─────────────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
    if [[ -z "$LIBCLANG_PATH" ]]; then
        CLANG_LIB=$(find /usr/lib/llvm-* /usr/lib/x86_64-linux-gnu -name "libclang*.so*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
        if [[ -n "$CLANG_LIB" ]]; then
            export LIBCLANG_PATH="$CLANG_LIB"
            echo -e "${GREEN}[OK] LIBCLANG_PATH=$LIBCLANG_PATH${NC}"
        else
            echo -e "${YELLOW}[WARN] Could not auto-detect LIBCLANG_PATH – whisper-rs may fail to compile${NC}"
        fi
    fi
fi

# ── npm install ───────────────────────────────────────────────────────────────
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}[INSTALL] node_modules missing – running npm install...${NC}"
    npm install
else
    echo -e "${GREEN}[OK] node_modules present${NC}"
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}[START] Launching DragonFly (hot reload)...${NC}\n"
npm run dev:tauri
