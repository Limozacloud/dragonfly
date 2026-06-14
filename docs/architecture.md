# Architecture

## Overview

DragonFly is a desktop application built with [Tauri v2](https://tauri.app/). The frontend runs as a React web app inside a native WebView; the backend is a Rust process that handles file I/O, encryption, database access, and system integration.

```
┌─────────────────────────────────────┐
│           React Frontend            │
│  (TypeScript + Vite + TailwindCSS)  │
│                                     │
│  components/  stores/  services/    │
└─────────────┬───────────────────────┘
              │  Tauri IPC (invoke / emit)
┌─────────────▼───────────────────────┐
│           Rust Backend              │
│              (Tauri v2)             │
│                                     │
│  backup.rs  voice.rs  notifications │
└─────────────┬───────────────────────┘
              │
    ┌─────────┼──────────┐
    │         │          │
  SQLite   Whisper     File system
  (local)  (local)    (attachments,
                        backups)
```

## Frontend

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + Shadcn/ui |
| State | Zustand (6 stores) |
| Editor | BlockNote (rich text) |
| i18n | react-i18next (8 languages) |
| DB access | tauri-plugin-sql (SQLite) |

### State Management

Each domain has its own Zustand store:

| Store | Responsibility |
|-------|---------------|
| `taskStore` | Kanban/todo tasks, columns |
| `noteStore` | Note tree, active note |
| `projectStore` | Projects, active project |
| `reminderStore` | Reminders, alert queue |
| `scratchpadStore` | Scratchpad blocks |
| `layoutStore` | Sidebar, panel state |

### Database

Schema and all migrations live in `src/services/database.ts`. The current `SCHEMA_VERSION` is the source of truth. Migrations run sequentially on startup.

Key tables: `projects`, `tasks`, `notes`, `reminders`, `app_config`, `scratchpads`.

`app_config` is a key-value store for global settings (e.g. `auto_logout_minutes`, `minimize_to_tray`).

## Backend (Rust)

The Rust backend exposes Tauri commands registered in `src-tauri/src/lib.rs`. All commands return `Result<T, String>`.

| Module | Commands |
|--------|---------|
| `backup.rs` | `create_backup`, `list_backups`, `delete_backup` |
| `voice.rs` | `get_whisper_models_status`, `download_whisper_model`, `delete_whisper_model`, `transcribe_audio` |
| `notifications.rs` | `send_notification_email` |

### Security Considerations

- All file operations validate paths to prevent directory traversal
- SMTP credentials are passed per-call from the frontend (not stored in Rust)
- The `--hidden` autostart flag hides the window on system startup
- Voice model downloads use a temp file pattern to avoid corrupt-on-failure

## Data Flow: Voice Transcription

```
Frontend (VoiceRecorderModal)
  └─ records WAV → saves to app_data_dir via tauri-plugin-fs
  └─ invoke("transcribe_audio", { audio_filename, model })
        └─ Rust: validates filename, loads Whisper model
        └─ Rust: spawn_blocking → decode WAV → run inference
        └─ Rust: delete temp audio file
        └─ Returns transcript text → displayed in editor
```

## Data Flow: Sync (Optional)

DragonFly can sync with a self-hosted [PocketBase](https://pocketbase.io/) instance. Sync is opt-in per project and stores encrypted records. The sync service lives in `src/services/syncService.ts`.

## Permissions

Tauri v2 uses a capabilities system. All IPC permissions are explicitly listed in `src-tauri/capabilities/default.json`. No implicit access to the filesystem, shell, or OS APIs.
