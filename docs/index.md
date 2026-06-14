# DragonFly

**Privacy-first, offline-capable project management for your desktop.**

DragonFly runs entirely on your machine — no cloud account, no telemetry, no subscriptions. All data is stored locally in SQLite. The app can be locked with a passphrase to prevent unauthorized access. For teams, DragonFly optionally syncs via a self-hosted [PocketBase](https://pocketbase.io/) instance — all record content is encrypted on the client with AES-256-GCM before leaving your device. The encryption key is derived from your **Space Key** (a shared passphrase) and the server URL using PBKDF2. The server stores only encrypted payloads alongside sync metadata (record IDs and timestamps).

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Project overview — open releases, features, tasks, and recent notes at a glance |
| **Kanban Board** | Drag & drop task management with release and user filters, collapsible columns |
| **Todo List** | Filterable task list (by release, feature, tag); card or list view; CSV export |
| **Rich Notes** | Hierarchical notes with BlockNote editor — Markdown, Mermaid diagrams, favorites, embedded Scratchpad blocks |
| **Scratchpad** | Excalidraw-based drawing canvas; each scratchpad can be embedded as a block inside any note |
| **Releases** | Group tasks by release, track progress, generate CAB reports (with optional AI improvement) |
| **Reminders** | Recurring reminders with in-app alerts and optional email notifications via SMTP |
| **Voice Input** | Speech-to-text via Whisper.cpp (offline), OpenAI Whisper API, or live browser recognition |
| **Multi-project** | Manage multiple separate projects, each with its own data and sync settings |
| **Backups** | One-click ZIP backup and restore of all data and attachments |
| **App Lock** | Passphrase lock on startup with configurable auto-logout |
| **AI Integration** | OpenAI-powered CAB report improvement; customizable prompts per use case |
| **Sync** | Optional team sync via self-hosted PocketBase with client-side AES-GCM encryption |
| **i18n** | UI available in 8 languages |

---

## Quick Start

**Windows** — download the latest `.msi` or `.exe` from the [Releases page](https://github.com/Limozacloud/dragonfly/releases).

**Linux** — download the `.deb`, `.rpm`, or `.AppImage` from the [Releases page](https://github.com/Limozacloud/dragonfly/releases).

**Build from source:**

```bash
git clone https://github.com/Limozacloud/dragonfly.git
cd dragonfly
npm install
npm run dev:tauri
```

See [Building](building.md) for full instructions including a Docker-based build.

---

## Documentation

- [Getting Started](getting-started.md) — Set up your dev environment
- [Building](building.md) — Local build, Docker build, CI/CD
- [Architecture](architecture.md) — System design and data flow
- [PocketBase Sync](pocketbase.md) — Self-hosted sync with Docker
- [Security Audit](security-audit.md) — Code audit findings

---

## Contributing

See [CONTRIBUTING.md](https://github.com/Limozacloud/dragonfly/blob/main/CONTRIBUTING.md) on GitHub.
