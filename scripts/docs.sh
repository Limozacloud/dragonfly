#!/usr/bin/env bash
# DragonFly – Docs dev server (Linux / macOS)
# Creates/activates venv, installs mkdocs-material, starts hot-reload server.
# Usage: ./scripts/docs.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}=== DragonFly – Docs ===${NC}"

VENV_DIR=".venv"

# ── Python check ──────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}[ERROR] python3 not found. Install via: sudo apt install python3 python3-venv${NC}"
    exit 1
fi

# ── venv ──────────────────────────────────────────────────────────────────────
if [[ ! -f "$VENV_DIR/bin/python" ]]; then
    echo -e "${YELLOW}[SETUP] Creating virtual environment...${NC}"
    python3 -m venv "$VENV_DIR"
else
    echo -e "${GREEN}[OK] venv exists${NC}"
fi

# ── install / sync requirements ───────────────────────────────────────────────
echo -e "${YELLOW}[SETUP] Installing requirements...${NC}"
"$VENV_DIR/bin/pip" install -q -r requirements-docs.txt

# ── launch ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}[START] Starting MkDocs at http://127.0.0.1:8001${NC}\n"
"$VENV_DIR/bin/mkdocs" serve --dev-addr 127.0.0.1:8001
