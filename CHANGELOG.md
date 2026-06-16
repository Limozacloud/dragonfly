# Changelog

All notable changes to DragonFly are documented here.

> Full development history prior to public release: [McHill007/dragonfly](https://github.com/McHill007/dragonfly)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

---

## [0.2.0](https://github.com/Limozacloud/dragonfly/compare/dragonfly-v0.1.17...dragonfly-v0.2.0) (2026-06-16)


### Features

* **sync:** private projects, per-project passphrase, fix file downloads ([#35](https://github.com/Limozacloud/dragonfly/issues/35)) ([bf7bac1](https://github.com/Limozacloud/dragonfly/commit/bf7bac1ce3cbccee20aa75bc1bf4352d8a749083))
* UI enhancements, sync UX refactor, passphrase change, notes improvements ([#33](https://github.com/Limozacloud/dragonfly/issues/33)) ([7accf27](https://github.com/Limozacloud/dragonfly/commit/7accf27318bbf4b1316acff1b4e850ea74fa765a))


### Bug Fixes

* adapt to whisper-rs 0.16 get_segment returning Option ([a66db2c](https://github.com/Limozacloud/dragonfly/commit/a66db2c76b06f99be9e3faa9a6856050f51f12b0))
* add clang to deps and improve LIBCLANG_PATH detection in build.sh ([32e392d](https://github.com/Limozacloud/dragonfly/commit/32e392dd8e0d5d180cd49b3384632bbca85c47b0))
* add libssl-dev and pkg-config to build.sh dependencies ([d4f05ff](https://github.com/Limozacloud/dragonfly/commit/d4f05ffef99fc15b3e9056cd370bb4200d7840ca))
* align tauri npm packages with resolved Rust crate versions ([#17](https://github.com/Limozacloud/dragonfly/issues/17)) ([47b56e7](https://github.com/Limozacloud/dragonfly/commit/47b56e710d8a48298bcaf3af2124f1368dc6e644))
* bump tauri to 2.11.2 to address CVE-2026-42184 ([3b9c90d](https://github.com/Limozacloud/dragonfly/commit/3b9c90d9fb35917dd7421f082c7caf1e6d716dfe))
* handle Result from WhisperSegment::to_str_lossy for whisper-rs 0.16 ([029a1ca](https://github.com/Limozacloud/dragonfly/commit/029a1ca49f25608ead1d3f71bf45c71deff78851))
* install curl before nvm/rustup in build.sh ([0c2d80c](https://github.com/Limozacloud/dragonfly/commit/0c2d80c3db215ee103bf2868f23d6d89f04d410f))
* move LLVM detection before dependency check in dev/build scripts; add install summary to setup scripts ([0ec7632](https://github.com/Limozacloud/dragonfly/commit/0ec7632306ca31d02593ea682009ef5806b0fcad))
* resolve clippy warnings in CI ([766f53f](https://github.com/Limozacloud/dragonfly/commit/766f53f3b6ad1dabbdbd13367aa8b84206f43860))
* source nvm/cargo env in dev.sh and build.sh, set execute bits ([587cf0d](https://github.com/Limozacloud/dragonfly/commit/587cf0da7092664183814d969eb1f1b5b6ded755))
* update whisper-rs API for v0.16 compatibility ([1d72333](https://github.com/Limozacloud/dragonfly/commit/1d72333db3d2f35a3d75e45b78c9bb873174d319))
* use GITHUB_TOKEN for release-please ([b39dc55](https://github.com/Limozacloud/dragonfly/commit/b39dc55e1a1c1397945972cd42e81207ec98802f))
* use WhisperSegment::to_str_lossy for whisper-rs 0.16 compatibility ([61e062c](https://github.com/Limozacloud/dragonfly/commit/61e062cb627fe497cfc88cfabfc0cb35114d77c1))

## [Unreleased]

---
## [0.1.17] — 2026-03-02

### Fixed
- Images and file attachments not loading in installed (bundled) builds

---

## [0.1.16] — 2026-03-02

### Added
- Voice input for notes (Live / OpenAI / Local Whisper)
- Minimize-to-tray toggle

### Changed
- Improved language support

---

## [0.1.15] — 2026-02-25

### Added
- Markdown paste conversion
- Anchor links in the editor

### Changed
- Improved editor typography

---

## [0.1.14] — 2026-02-25

### Fixed
- Attachment path resolution

### Added
- Single-instance enforcement (second launch focuses existing window)
- Autostart with `--hidden` flag (starts minimized to tray)

---

## [0.1.13] — 2026-02-24

### Added
- Code syntax highlighting in the editor
- Mermaid diagram support in the notes editor

---

## [0.1.12] — 2026-02-24

### Added
- Personal reminders with due date and recurrence
- Email notifications for reminders
- Tray integration for reminders

---

## [0.1.11] — 2026-02-21

### Added
- Resizable sidebar
- Batch-move for features

### Changed
- Dependency upgrades

---

## [0.1.10] — 2026-02-21

### Added
- Scratchpad trash / restore
- Scratchpad favorites
- Multi-login handling

---

## [0.1.9] — 2026-02-21

### Added
- Logging improvements

---

## [0.1.8] — 2026-02-20

### Added
- Task priority field
- Note favorites
- Embeddable Scratchpad blocks in the editor

---

## [0.1.7] — 2026-02-20

### Added
- Scratchpad with Excalidraw drawing canvas

---

## [0.1.6] — 2026-02-20

### Added
- `dragonfly://` space URL protocol
- Schema versioning for the local database

---

## [0.1.5] — 2026-02-19

### Added
- Multi-project support
- Table of contents in the notes editor
- Customizable AI prompts

---

## [0.1.4] — 2026-02-16

### Added
- Collapsible sidebar
- Collapsible Kanban columns

---

## [0.1.3] — 2026-02-15

### Added
- Update checker
- Quick-add buttons
- CAB report generation

---

## [0.1.2] — 2026-02-15

### Added
- Task search field
- Database backup management

### Changed
- CI build improvements

---

## [0.1.1] — 2026-02-15

### Added
- Database backup and restore
- Trash / soft-delete
- 6 additional UI languages
- Linux builds (.deb, .rpm, .AppImage)

---

## [0.1.0] — 2026-02-14

### Added
- PocketBase sync with end-to-end AES-GCM encryption
- Hierarchical notes with sub-notes
- AI integration with customizable prompts
- Kanban board
- User management
