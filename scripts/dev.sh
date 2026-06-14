#!/usr/bin/env bash
# DragonFly – Dev startup (Linux / macOS)
# Run ./scripts/setup.sh first to install all dependencies.
# Usage: ./scripts/dev.sh

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "\n${CYAN}=== DragonFly – Dev Setup ===${NC}"

# ── Preflight checks ──────────────────────────────────────────────────────────
MISSING=()
command -v node  &>/dev/null || MISSING+=("node")
command -v cargo &>/dev/null || MISSING+=("cargo")
command -v npm   &>/dev/null || MISSING+=("npm")

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo -e "${RED}[ERROR] Missing: ${MISSING[*]}${NC}"
    echo -e "        Run ./scripts/setup.sh first."
    exit 1
fi

echo -e "${GREEN}[OK] Node.js $(node --version)${NC}"
echo -e "${GREEN}[OK] Rust $(rustc --version)${NC}"

# ── Source cargo env ──────────────────────────────────────────────────────────
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# ── LIBCLANG_PATH (Linux) ─────────────────────────────────────────────────────
if [[ "$(uname -s)" == "Linux" && -z "$LIBCLANG_PATH" ]]; then
    CLANG_LIB=""
    command -v llvm-config &>/dev/null && CLANG_LIB=$(llvm-config --libdir 2>/dev/null || true)
    if [[ -z "$CLANG_LIB" ]]; then
        CLANG_LIB=$(find /usr/lib/llvm-* /usr/lib/x86_64-linux-gnu /usr/lib -maxdepth 3 \
            -name "libclang*.so*" 2>/dev/null | head -1 | xargs -I{} dirname {} 2>/dev/null || true)
    fi
    [[ -n "$CLANG_LIB" ]] && export LIBCLANG_PATH="$CLANG_LIB" && echo -e "${GREEN}[OK] LIBCLANG_PATH=$LIBCLANG_PATH${NC}"
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
