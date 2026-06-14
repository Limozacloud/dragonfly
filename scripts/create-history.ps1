Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "E:\Development\DragonFly"

# Files reserved for the final "today" commit
$todayFiles = @(
    "eslint.config.js",
    "vitest.config.ts",
    "src/types/db.ts",
    "src/lib/content.test.ts",
    "src/types/reminder.test.ts",
    "src/services/crypto.test.ts",
    ".github/workflows/ci.yml",
    ".github/workflows/release-please.yml",
    "release-please-config.json",
    ".release-please-manifest.json"
)

function Set-VersionJson($file, $ver) {
    if (-not (Test-Path $file)) { return }
    $raw = Get-Content $file -Raw
    $raw = [regex]::Replace($raw, '"version":\s*"[\d.]+"', """version"": ""$ver""")
    [System.IO.File]::WriteAllText((Resolve-Path $file).Path, $raw)
}

function Set-VersionToml($file, $ver) {
    if (-not (Test-Path $file)) { return }
    $raw = Get-Content $file -Raw
    # Only replace the first occurrence (package version, not dependency versions)
    $raw = [regex]::Replace($raw, '^version = "[\d.]+"', "version = ""$ver""", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    [System.IO.File]::WriteAllText((Resolve-Path $file).Path, $raw)
}

$changelogHeader = @"
# Changelog

All notable changes to DragonFly are documented here.

> Full development history prior to public release: [McHill007/dragonfly](https://github.com/McHill007/dragonfly)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [Unreleased]

---

"@

# Ordered oldest → newest
$versions = @(
    @{ ver="0.1.0"; date="2026-02-14T12:00:00"; msg="feat: initial public release"
       entry=@"
## [0.1.0] — 2026-02-14

### Added
- PocketBase sync with end-to-end AES-GCM encryption
- Hierarchical notes with sub-notes
- AI integration with customizable prompts
- Kanban board
- User management
"@ },
    @{ ver="0.1.1"; date="2026-02-15T10:00:00"; msg="feat: backup, trash, i18n, Linux builds"
       entry=@"
## [0.1.1] — 2026-02-15

### Added
- Database backup and restore
- Trash / soft-delete
- 6 additional UI languages
- Linux builds (.deb, .rpm, .AppImage)
"@ },
    @{ ver="0.1.2"; date="2026-02-15T14:00:00"; msg="feat: task search, backup management"
       entry=@"
## [0.1.2] — 2026-02-15

### Added
- Task search field
- Database backup management

### Changed
- CI build improvements
"@ },
    @{ ver="0.1.3"; date="2026-02-15T17:00:00"; msg="feat: update checker, quick-add, CAB report"
       entry=@"
## [0.1.3] — 2026-02-15

### Added
- Update checker
- Quick-add buttons
- CAB report generation
"@ },
    @{ ver="0.1.4"; date="2026-02-16T11:00:00"; msg="feat: collapsible sidebar and Kanban columns"
       entry=@"
## [0.1.4] — 2026-02-16

### Added
- Collapsible sidebar
- Collapsible Kanban columns
"@ },
    @{ ver="0.1.5"; date="2026-02-19T10:00:00"; msg="feat: multi-project, ToC, AI prompts"
       entry=@"
## [0.1.5] — 2026-02-19

### Added
- Multi-project support
- Table of contents in the notes editor
- Customizable AI prompts
"@ },
    @{ ver="0.1.6"; date="2026-02-20T09:00:00"; msg="feat: dragonfly:// protocol, schema versioning"
       entry=@"
## [0.1.6] — 2026-02-20

### Added
- ``dragonfly://`` space URL protocol
- Schema versioning for the local database
"@ },
    @{ ver="0.1.7"; date="2026-02-20T12:00:00"; msg="feat: scratchpad with Excalidraw"
       entry=@"
## [0.1.7] — 2026-02-20

### Added
- Scratchpad with Excalidraw drawing canvas
"@ },
    @{ ver="0.1.8"; date="2026-02-20T15:00:00"; msg="feat: task priority, note favorites, scratchpad blocks"
       entry=@"
## [0.1.8] — 2026-02-20

### Added
- Task priority field
- Note favorites
- Embeddable Scratchpad blocks in the editor
"@ },
    @{ ver="0.1.9"; date="2026-02-21T09:00:00"; msg="chore: logging improvements"
       entry=@"
## [0.1.9] — 2026-02-21

### Added
- Logging improvements
"@ },
    @{ ver="0.1.10"; date="2026-02-21T11:00:00"; msg="feat: scratchpad trash/favorites, multi-login"
       entry=@"
## [0.1.10] — 2026-02-21

### Added
- Scratchpad trash / restore
- Scratchpad favorites
- Multi-login handling
"@ },
    @{ ver="0.1.11"; date="2026-02-21T14:00:00"; msg="feat: resizable sidebar, batch-move"
       entry=@"
## [0.1.11] — 2026-02-21

### Added
- Resizable sidebar
- Batch-move for features

### Changed
- Dependency upgrades
"@ },
    @{ ver="0.1.12"; date="2026-02-24T10:00:00"; msg="feat: reminders, email notifications, tray"
       entry=@"
## [0.1.12] — 2026-02-24

### Added
- Personal reminders with due date and recurrence
- Email notifications for reminders
- Tray integration for reminders
"@ },
    @{ ver="0.1.13"; date="2026-02-24T14:00:00"; msg="feat: code highlighting, Mermaid diagrams"
       entry=@"
## [0.1.13] — 2026-02-24

### Added
- Code syntax highlighting in the editor
- Mermaid diagram support in the notes editor
"@ },
    @{ ver="0.1.14"; date="2026-02-25T10:00:00"; msg="fix: attachments, single instance, autostart"
       entry=@"
## [0.1.14] — 2026-02-25

### Fixed
- Attachment path resolution

### Added
- Single-instance enforcement (second launch focuses existing window)
- Autostart with ``--hidden`` flag (starts minimized to tray)
"@ },
    @{ ver="0.1.15"; date="2026-02-25T14:00:00"; msg="feat: markdown paste, anchor links"
       entry=@"
## [0.1.15] — 2026-02-25

### Added
- Markdown paste conversion
- Anchor links in the editor

### Changed
- Improved editor typography
"@ },
    @{ ver="0.1.16"; date="2026-03-02T10:00:00"; msg="feat: voice input, minimize-to-tray"
       entry=@"
## [0.1.16] — 2026-03-02

### Added
- Voice input for notes (Live / OpenAI / Local Whisper)
- Minimize-to-tray toggle

### Changed
- Improved language support
"@ },
    @{ ver="0.1.17"; date="2026-03-02T14:00:00"; msg="fix: images and attachments in installed builds"
       entry=@"
## [0.1.17] — 2026-03-02

### Fixed
- Images and file attachments not loading in installed (bundled) builds
"@ }
)

# Accumulate entries newest-first as we progress
$accumulated = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $versions.Count; $i++) {
    $v = $versions[$i]

    Write-Host "→ Preparing v$($v.ver) ($($v.date))" -ForegroundColor Cyan

    # Prepend new entry (newest first in file)
    $accumulated.Insert(0, $v.entry.TrimEnd())

    # Write CHANGELOG
    $changelogBody = $accumulated -join "`n`n---`n`n"
    [System.IO.File]::WriteAllText(
        (Join-Path (Get-Location) "CHANGELOG.md"),
        $changelogHeader + $changelogBody + "`n"
    )

    # Every historical commit: only CHANGELOG.md
    git add CHANGELOG.md

    $env:GIT_AUTHOR_DATE    = $v.date
    $env:GIT_COMMITTER_DATE = $v.date
    git commit -m "chore: release v$($v.ver) — $($v.msg)"
    Remove-Item Env:\GIT_AUTHOR_DATE
    Remove-Item Env:\GIT_COMMITTER_DATE

    Write-Host "  ✓ committed v$($v.ver)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! 18 commits created." -ForegroundColor Green
Write-Host "Run 'git log --oneline' to verify, then push to Limozacloud/dragonfly." -ForegroundColor Yellow
