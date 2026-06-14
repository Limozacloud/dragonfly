# Contributing to DragonFly

Thank you for your interest in contributing! This document explains how to get involved.

## Branching Strategy

DragonFly uses **GitHub Flow**:

```
main  ←  always deployable, protected
  └── feature/my-feature
  └── fix/crash-on-startup
  └── docs/update-readme
  └── chore/bump-deps
```

- Branch off `main` for all work
- Name branches with a prefix: `feature/`, `fix/`, `docs/`, `chore/`
- Open a Pull Request into `main` when ready
- PRs require passing CI before merge
- Merging into `main` triggers the release workflow

## Development Setup

### One-click start (recommended)

The scripts in `scripts/` handle all prerequisites automatically.

**Windows:**
```powershell
git clone https://github.com/limoza-dragonfly/dragonfly.git
cd dragonfly
.\scripts\dev.ps1
```

**Linux / macOS:**
```bash
git clone https://github.com/limoza-dragonfly/dragonfly.git
cd dragonfly
chmod +x scripts/dev.sh
./scripts/dev.sh
```

The script installs missing tools (Node.js, Rust, CMake, LLVM/libclang, system libraries), runs `npm install`, and starts the app with hot reload.

### Manual setup (if you prefer)

| Tool | Windows | Linux |
|------|---------|-------|
| Node.js 20+ | `winget install OpenJS.NodeJS.LTS` | `nvm install --lts` |
| Rust stable | [rustup.rs](https://rustup.rs) | `curl … \| sh` |
| CMake | `winget install Kitware.CMake` | `apt install cmake` |
| LLVM | `winget install LLVM.LLVM` | `apt install libclang-dev` |
| Tauri deps | — | `apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev` |

```bash
npm install
npm run dev:tauri   # Desktop app with hot reload
# or:
npm run dev         # Browser only (no Tauri APIs, instant feedback)
```

### Building a release

**Windows** → MSI installer:
```powershell
.\scripts\build.ps1
# Optional flags: -SkipFrontend  -Debug
```

**Linux** → .deb / .AppImage:
```bash
./scripts/build.sh
# Optional flags: --skip-frontend  --debug
```

## Project Structure

```
dragonfly/
├── src/                  # React + TypeScript frontend
│   ├── components/       # UI components
│   ├── services/         # Business logic & DB access
│   ├── stores/           # Zustand state stores
│   ├── editor/           # BlockNote extensions
│   ├── i18n/             # Translation files (8 languages)
│   └── types/            # TypeScript type definitions
├── src-tauri/            # Rust backend (Tauri)
│   └── src/commands/     # Tauri command handlers
├── docs/                 # Documentation
└── .github/              # CI, templates, Dependabot
```

See [docs/architecture.md](docs/architecture.md) for a deeper overview.

## Making Changes

### Frontend (React/TypeScript)

- Components go in `src/components/`
- All user-facing strings must use i18n keys (`src/i18n/*.json`)
- Use existing Shadcn/ui components from `src/components/ui/`
- State management via Zustand stores in `src/stores/`

### Backend (Rust/Tauri)

- New commands go in `src-tauri/src/commands/`
- Register commands in both `invoke_handler` (lib.rs) and `capabilities/default.json`
- Return `Result<T, String>` from all `#[tauri::command]` functions
- Validate all user-supplied paths before use (no path traversal)

### Database

- Schema and migrations are in `src/services/database.ts`
- Increment `SCHEMA_VERSION` and add a migration block for any schema changes
- Never drop columns in migrations — add nullable columns or new tables

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Follow the checklist in the PR template
3. Ensure `npm run build` and `cargo check` both pass
4. Submit the PR — CI will run automatically

## Code Style

- **TypeScript:** no explicit `any`, use strict types
- **Rust:** follow `cargo clippy` — no warnings
- **Formatting:** Prettier for TypeScript, `rustfmt` for Rust
- **Comments:** only when the *why* is non-obvious

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml)
- For security issues, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the same license as this project. See [LICENSE](LICENSE).
