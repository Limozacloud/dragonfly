#!/usr/bin/env bash
# DragonFly – Release build (Linux → .deb / .AppImage / .rpm)
# Run ./scripts/setup.sh first to install all dependencies.
# Usage: ./scripts/build.sh [--skip-frontend] [--debug]

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

SKIP_FRONTEND=false
DEBUG=false

for arg in "$@"; do
    case $arg in
        --skip-frontend) SKIP_FRONTEND=true ;;
        --debug)         DEBUG=true ;;
    esac
done

START_TIME=$SECONDS
echo -e "\n${CYAN}=== DragonFly – Release Build (Linux) ===${NC}"
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
echo -e "Version: $VERSION\n"

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

# ── LIBCLANG_PATH ─────────────────────────────────────────────────────────────
if [[ -z "$LIBCLANG_PATH" ]]; then
    CLANG_LIB=""
    command -v llvm-config &>/dev/null && CLANG_LIB=$(llvm-config --libdir 2>/dev/null || true)
    if [[ -z "$CLANG_LIB" ]]; then
        CLANG_LIB=$(find /usr/lib/llvm-* /usr/lib/x86_64-linux-gnu /usr/lib -maxdepth 3 \
            -name "libclang*.so*" 2>/dev/null | head -1 | xargs -I{} dirname {} 2>/dev/null || true)
    fi
    if [[ -n "$CLANG_LIB" ]]; then
        export LIBCLANG_PATH="$CLANG_LIB"
        echo -e "${GREEN}[OK] LIBCLANG_PATH=$LIBCLANG_PATH${NC}"
    else
        echo -e "${YELLOW}[WARN] Could not auto-detect LIBCLANG_PATH – set it manually if build fails${NC}"
    fi
fi

# ── npm install ───────────────────────────────────────────────────────────────
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}[INSTALL] node_modules missing – running npm install...${NC}"
    npm install
fi

# ── Frontend build ────────────────────────────────────────────────────────────
if [[ "$SKIP_FRONTEND" == false ]]; then
    echo -e "\n${YELLOW}[1/2] Building frontend...${NC}"
    npm run build
    echo -e "${GREEN}  Frontend OK${NC}"
else
    echo -e "${GRAY}[1/2] Skipping frontend (reusing dist/)${NC}"
fi

# ── Tauri build ───────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/2] Building Tauri...${NC}"
if [[ "$DEBUG" == true ]]; then
    npx tauri build --debug
else
    npx tauri build
fi

# ── Output paths ──────────────────────────────────────────────────────────────
ELAPSED=$(( SECONDS - START_TIME ))
echo -e "\n${GREEN}Build complete in ${ELAPSED}s${NC}"

PROFILE=$([ "$DEBUG" == true ] && echo "debug" || echo "release")
BUNDLE_DIR="src-tauri/target/$PROFILE/bundle"

[ -d "$BUNDLE_DIR/deb" ]      && echo -e "  deb    : $(find "$BUNDLE_DIR/deb" -name '*.deb' | head -1)"
[ -d "$BUNDLE_DIR/appimage" ] && echo -e "  AppImage: $(find "$BUNDLE_DIR/appimage" -name '*.AppImage' | head -1)"
[ -d "$BUNDLE_DIR/rpm" ]      && echo -e "  rpm    : $(find "$BUNDLE_DIR/rpm" -name '*.rpm' | head -1)"
echo ""
