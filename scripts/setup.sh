#!/usr/bin/env bash
# DragonFly – Environment Setup (Linux / macOS)
# Installs all build dependencies for DragonFly development.
# Run once before using dev.sh or build.sh.
# Usage: ./scripts/setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}=== DragonFly – Environment Setup ===${NC}"

OS="$(uname -s)"

# ── System packages (Linux only) ──────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
    PKGS=()
    command -v curl &>/dev/null                || PKGS+=("curl")
    dpkg -s pkg-config &>/dev/null             || PKGS+=("pkg-config")
    dpkg -s libssl-dev &>/dev/null             || PKGS+=("libssl-dev")
    dpkg -s libwebkit2gtk-4.1-dev &>/dev/null || PKGS+=("libwebkit2gtk-4.1-dev")
    dpkg -s libclang-dev &>/dev/null           || PKGS+=("libclang-dev")
    command -v clang &>/dev/null               || PKGS+=("clang")
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
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo -e "${YELLOW}[INSTALL] Node.js not found – installing via nvm...${NC}"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm install --lts && nvm use --lts
    echo -e "${GREEN}[OK] Node.js $(node --version)${NC}"
else
    echo -e "${GREEN}[OK] Node.js $(node --version)${NC}"
fi

# ── Rust ──────────────────────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
    echo -e "${YELLOW}[INSTALL] Rust not found – installing rustup...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    source "$HOME/.cargo/env"
    echo -e "${GREEN}[OK] Rust $(rustc --version)${NC}"
else
    echo -e "${GREEN}[OK] Rust $(rustc --version)${NC}"
fi

[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# ── LIBCLANG_PATH (Linux) ─────────────────────────────────────────────────────
if [[ "$OS" == "Linux" && -z "$LIBCLANG_PATH" ]]; then
    CLANG_LIB=""
    if command -v llvm-config &>/dev/null; then
        CLANG_LIB=$(llvm-config --libdir 2>/dev/null || true)
    fi
    if [[ -z "$CLANG_LIB" ]]; then
        CLANG_LIB=$(find /usr/lib/llvm-* /usr/lib/x86_64-linux-gnu /usr/lib -maxdepth 3 \
            -name "libclang*.so*" 2>/dev/null | head -1 | xargs -I{} dirname {} 2>/dev/null || true)
    fi
    if [[ -n "$CLANG_LIB" ]]; then
        export LIBCLANG_PATH="$CLANG_LIB"
        # Persist across sessions
        PROFILE_FILE="$HOME/.bashrc"
        [[ "$SHELL" == */zsh ]] && PROFILE_FILE="$HOME/.zshrc"
        if ! grep -q "LIBCLANG_PATH" "$PROFILE_FILE" 2>/dev/null; then
            echo "export LIBCLANG_PATH=\"$CLANG_LIB\"" >> "$PROFILE_FILE"
        fi
        echo -e "${GREEN}[OK] LIBCLANG_PATH=$LIBCLANG_PATH (saved to $PROFILE_FILE)${NC}"
    else
        echo -e "${YELLOW}[WARN] Could not auto-detect LIBCLANG_PATH – set it manually if the build fails${NC}"
    fi
fi

# ── npm install ───────────────────────────────────────────────────────────────
echo -e "${YELLOW}[INSTALL] Running npm install...${NC}"
npm install
echo -e "${GREEN}[OK] npm packages installed${NC}"

echo -e "\n${GREEN}[DONE] All dependencies installed.${NC}"
echo -e "       You can now run:  ./scripts/dev.sh\n"
