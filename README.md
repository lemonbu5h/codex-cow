# Codex Cow

[![CI](https://github.com/lemonbu5h/codex-cow/actions/workflows/ci.yml/badge.svg)](https://github.com/lemonbu5h/codex-cow/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/lemonbu5h/codex-cow/branch/main/graph/badge.svg)](https://codecov.io/gh/lemonbu5h/codex-cow)
[![Release](https://github.com/lemonbu5h/codex-cow/actions/workflows/release.yml/badge.svg)](https://github.com/lemonbu5h/codex-cow/actions/workflows/release.yml)
[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-black?logo=bun)](https://bun.sh)

Clean up local Codex sessions with `dexcow`. Pick a repo, select sessions, and confirm.

**Prefer the built-in option?** In Codex, archive a session, then open **Settings → Archived chats** to delete it. No extra tool needed.

Use dexcow to delete sessions across several repos in one go. An [agent skill](docs/usage.md#agent-skill) is also available.

## Demo

<p>
  <img src="docs/assets/dexcow-repo-picker.svg" alt="dexcow repo picker showing demo repositories" width="920">
</p>

<p>
  <img src="docs/assets/dexcow-session-picker.svg" alt="dexcow session picker showing demo sessions" width="920">
</p>

## Quick Start

macOS Apple Silicon and Linux x64. **No Bun installation required.**

```bash
curl -fsSL https://raw.githubusercontent.com/lemonbu5h/codex-cow/main/install.sh | sh
dexcow
```

Press space to select sessions. Enter or Esc returns to repos and keeps your selections. Choose **Review selected** when ready; q quits without deleting.

Run `dexcow help` for commands, or `dexcow archived` to select archived sessions for deletion.

[Manual downloads](https://github.com/lemonbu5h/codex-cow/releases/latest) · [Agent skill setup](docs/usage.md#agent-skill) · [Run from source](docs/development.md)

## Safety

**Deletion is permanent.** Review your selection before confirming. Locked sessions cannot be selected.

Dexcow edits local Codex storage, whose format can change between updates. It leaves your project files and Codex settings alone. See [what gets deleted](docs/architecture.md#purge-scope).

## Documentation

- [Usage and agent skill](docs/usage.md)
- [Development and source installation](docs/development.md)
- [Architecture and deletion scope](docs/architecture.md)
- [Release process](docs/release.md)

## License

MIT. See [LICENSE](./LICENSE).
