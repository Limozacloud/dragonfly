#!/usr/bin/env bash
# DragonFly – Seed dummy data into the local dev SQLite database (Linux)
# Usage: ./scripts/seed.sh
# Only targets the dev database (dragonfly-dev) — never production.

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}=== DragonFly – Seed Data ===${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Find SQLite (auto-install if missing) ─────────────────────────────────────
if ! command -v sqlite3 &>/dev/null; then
    echo -e "${YELLOW}[INSTALL] sqlite3 not found – installing...${NC}"
    if ! command -v apt-get &>/dev/null; then
        echo -e "${RED}[ERROR] Auto-install is only supported on apt-based systems (Ubuntu/Debian).${NC}"
        echo -e "${YELLOW}        Install sqlite3 manually and re-run this script.${NC}"
        exit 1
    fi
    sudo apt-get install -y sqlite3
    echo -e "${GREEN}[OK] sqlite3 installed${NC}"
fi

# ── Find the DEV database ─────────────────────────────────────────────────────
# tauri.dev.conf.json uses identifier "dragonfly-dev" — never touches production.
DB_PATH="$HOME/.local/share/dragonfly-dev/dragonfly.db"
if [[ ! -f "$DB_PATH" ]]; then
    echo -e "${RED}[ERROR] Dev database not found at: $DB_PATH${NC}"
    echo -e "${YELLOW}        Launch DragonFly in dev mode first:  ./scripts/dev.sh${NC}"
    exit 1
fi

echo -e "${GREEN}[OK] Database: $DB_PATH${NC}"

# ── Choose seed set ───────────────────────────────────────────────────────────
echo -e "
Which seed set do you want to insert?

  [1] Alpha + Beta   – Main dev project & experimental features
  [2] Gamma + Delta  – Mobile app & data analytics (simulates PC2)
"
read -r -p "Choose [1/2]: " choice

case "$choice" in
    1)
        SEED_FILE="$SCRIPT_DIR/seed-alpha-beta.sql"
        LABEL="Alpha + Beta"
        SUMMARY="  - 2 projects (Alpha, Beta)
  - 5 users / 5 releases / 19 tasks
  - 9 notes (with hierarchy)
  - 3 scratchpads / 7 personal todos"
        ;;
    2)
        SEED_FILE="$SCRIPT_DIR/seed-gamma-delta.sql"
        LABEL="Gamma + Delta"
        SUMMARY="  - 2 projects (Gamma, Delta)
  - 5 users / 5 releases / 19 tasks
  - 7 notes (with hierarchy)
  - 3 scratchpads / 5 personal todos"
        ;;
    *)
        echo -e "${YELLOW}Invalid choice. Aborted.${NC}"
        exit 0
        ;;
esac

echo -e "
This will INSERT ${LABEL} dummy data:
${SUMMARY}

Existing rows with the same ID are skipped (INSERT OR IGNORE).
Your existing data will NOT be deleted.
"
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

# ── Apply seed SQL ────────────────────────────────────────────────────────────
echo -e "${YELLOW}[...] Applying ${LABEL} seed data...${NC}"

sqlite3 "$DB_PATH" < "$SEED_FILE"

echo -e "${GREEN}[DONE] ${LABEL} seed data inserted successfully.${NC}"
echo -e "       Restart DragonFly to see the data.\n"
