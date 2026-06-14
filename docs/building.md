# Building DragonFly

## Option A — Local Build

See [getting-started.md](getting-started.md) for prerequisites and the standard `npm run tauri build` flow.

## Option B — Docker Build (no local toolchain needed)

Use `docker/Dockerfile.build` to produce Linux binaries without installing Rust, Node.js, or CMake locally.

### Requirements

- [Docker](https://docs.docker.com/get-docker/) (Desktop or Engine)

### Build Linux packages

```bash
docker build -f docker/Dockerfile.build -t dragonfly-builder .
docker run --rm -v "$(pwd)/dist-docker:/out" dragonfly-builder
```

Artifacts (`.deb`, `.rpm`, `.AppImage`) are written to `dist-docker/` on your host.

### What the build container does

1. Starts from `rust:1.82-bookworm`
2. Installs Node.js 20, CMake, and all Tauri Linux system dependencies
3. Caches Cargo registry and npm packages as Docker layers
4. Runs `npm ci && npm run tauri build`
5. Copies bundle artifacts to `/out`

### Notes

- The Docker build produces **Linux** packages only. Windows installers require a Windows runner (use GitHub Actions).
- Build times: first build ~15–25 min (Rust compilation); subsequent builds ~2–4 min (layer cache).
- For CI builds, use the GitHub Actions workflow in `.github/workflows/release.yml`.

## Option C — GitHub Actions

Every merged PR into `main` automatically triggers the release workflow, which builds for both Windows and Linux and publishes a GitHub Release. See `.github/workflows/release.yml`.

For a manual rebuild without version bump:

1. Go to **Actions → Build & Release → Run workflow**
2. Set `skip_bump` to `true`

## Release Artifacts

| Platform | Format | Notes |
|----------|--------|-------|
| Windows | `.exe` (portable) | No installation, single binary |
| Windows | `-setup.exe` (NSIS) | Installer with auto-update support |
| Windows | `-setup.msi` (MSI) | Enterprise/GPO deployment |
| Linux | `.deb` | Debian / Ubuntu |
| Linux | `.rpm` | Fedora / openSUSE |
| Linux | `.AppImage` | Portable, works on any distro |
