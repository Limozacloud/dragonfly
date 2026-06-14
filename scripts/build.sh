#!/usr/bin/env bash
# DragonFly – Release build (Linux → .deb / .AppImage / .rpm)
# Checks all dependencies, installs missing ones, then builds the release bundles.
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

# ── System packages ───────────────────────────────────────────────────────────
PKGS=()
command -v curl &>/dev/null                || PKGS+=("curl")
dpkg -s pkg-config &>/dev/null             || PKGS+=("pkg-config")
dpkg -s libssl-dev &>/dev/null             || PKGS+=("libssl-dev")
dpkg -s libwebkit2gtk-4.1-dev &>/dev/null || PKGS+=("libwebkit2gtk-4.1-dev")
dpkg -s libclang-dev &>/dev/null           || PKGS+=("libclang-dev")
dpkg -s cmake &>/dev/null                  || PKGS+=("cmake")
dpkg -s build-essential &>/dev/null        || PKGS+=("build-essential")
dpkg -s libgtk-3-dev &>/dev/null           || PKGS+=("libgtk-3-dev")
dpkg -s librsvg2-dev &>/dev/null           || PKGS+=("librsvg2-dev")
dpkg -s libayatana-appindicator3-dev &>/dev/null || PKGS+=("libayatana-appindicator3-dev")
dpkg -s patchelf &>/dev/null               || PKGS+=("patchelf")

if [[ ${#PKGS[@]} -gt 0 ]]; then
    echo -e "${YELLOW}[INSTALL] Missing packages: ${PKGS[*]}${NC}"
    sudo apt-get update -qq
    sudo apt-get install -y "${PKGS[@]}"
else
    echo -e "${GREEN}[OK] System packages present${NC}"
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo -e "${YELLOW}[INSTALL] Node.js not found – installing via nvm...${NC}"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm install --lts && nvm use --lts
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

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# ── LIBCLANG_PATH ─────────────────────────────────────────────────────────────
if [[ -z "$LIBCLANG_PATH" ]]; then
    CLANG_LIB=$(find /usr/lib/llvm-* /usr/lib/x86_64-linux-gnu -name "libclang*.so*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
    if [[ -n "$CLANG_LIB" ]]; then
        export LIBCLANG_PATH="$CLANG_LIB"
        echo -e "${GREEN}[OK] LIBCLANG_PATH=$LIBCLANG_PATH${NC}"
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
