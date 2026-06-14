# Getting Started

This guide covers setting up a local development environment for DragonFly.

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| [Node.js](https://nodejs.org) | 20 | LTS recommended |
| [Rust](https://rustup.rs) | stable | `rustup install stable` |
| [CMake](https://cmake.org/download/) | any | Required by `whisper-rs` for bindgen |

### Windows

Install CMake and make sure it is in your PATH:
```powershell
winget install cmake
```

Or download the installer from [cmake.org](https://cmake.org/download/).

### Linux (Debian/Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf clang libclang-dev cmake build-essential
```

### Linux (Fedora)

```bash
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel \
  librsvg2-devel clang clang-devel cmake
```

## Clone & Run

```bash
git clone https://github.com/Limozacloud/dragonfly.git
cd dragonfly
npm install
npm run dev:tauri
```

This opens the full desktop app with hot-reload for the frontend.

**Frontend only** (browser, no native features):
```bash
npm run dev
# → http://localhost:1420
```

## Build for Release

```bash
npm run tauri build
```

Outputs are placed in `src-tauri/target/release/bundle/`.

For a Docker-based build that requires no local toolchain, see [building.md](building.md).

## Project Structure

```
dragonfly/
├── src/                   # React + TypeScript frontend
│   ├── components/        # UI pages and components
│   ├── components/ui/     # Shadcn/ui base components
│   ├── services/          # Business logic, DB, API
│   ├── stores/            # Zustand state
│   ├── editor/            # BlockNote extensions
│   ├── i18n/              # Translation JSON files
│   └── types/             # TypeScript types
├── src-tauri/
│   └── src/commands/      # Rust Tauri commands
├── docs/                  # Documentation
└── .github/               # Workflows, templates
```

## First Steps for Contributors

1. Check [CONTRIBUTING.md](https://github.com/Limozacloud/dragonfly/blob/main/CONTRIBUTING.md) for the contribution workflow
2. Read [architecture.md](architecture.md) for the system overview
3. Browse [open issues](https://github.com/Limozacloud/dragonfly/issues) for something to work on

## Common Issues

**`CMake not found` during `cargo build`**
→ Install CMake and restart your terminal so PATH is updated.

**`libwebkit2gtk` not found on Linux**
→ Run the apt/dnf install command above.

**App shows blank screen on `dev:tauri`**
→ Make sure Vite dev server started on port 1420 before Tauri opens the window. It usually retries automatically.
