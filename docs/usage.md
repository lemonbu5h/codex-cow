# Usage

## Commands

```bash
dexcow                 # pick active sessions to delete
dexcow help            # list commands
dexcow ls              # list active sessions
dexcow archived        # pick archived sessions to delete
dexcow ls --archived    # list archived sessions
dexcow rm <id...> --yes # permanently delete specific session IDs
dexcow --version
```

Pick a repo and press space to select sessions. Enter or Esc returns to repos and keeps your selections. Repeat for other repos, then choose **Review selected (N)** to confirm one combined deletion.

Esc at confirmation returns to repos with your selections intact. Esc does nothing in the repo view. Press q anywhere to quit without deleting. Key hints appear on each screen. Deletion is permanent.

## Sessions and Repositories

The default picker shows active sessions. `dexcow archived` shows already-archived sessions for deletion; it does not archive them. To delete through Codex instead, archive the session, then open **Settings > Archived chats**.

Sessions from Codex worktrees are grouped with their repository by Git origin. Sessions without a Git repository identity appear under **Unlinked sessions**. Internal subagent and guardian-review records are excluded.

Different sessions can share a title, including forks with shared history. A matching title does not mean they are the same session. Dexcow deletes the selected IDs, not every related fork. The displayed age is time since last activity, not time since archiving.

Locked sessions remain visible but cannot be selected. Dexcow checks locks again before confirmation and deletion.

If deleted sessions still appear in Codex, restart the app to refresh its list.

## Installation Options

The [installer](../install.sh) selects a release binary for macOS Apple Silicon or Linux x64. It uses `/usr/local/bin` when writable, otherwise `~/.local/bin`. Follow its PATH instructions if needed.

You can also download a binary from [GitHub Releases](https://github.com/lemonbu5h/codex-cow/releases/latest):

- macOS Apple Silicon: `dexcow-macos-arm64`
- Linux x64: `dexcow-linux-x64`

Make the downloaded file executable, rename it to `dexcow`, and place it in a directory on your PATH. Neither binary needs Bun. To build locally, see [Development](development.md).

Set `CODEX_HOME` to use a Codex directory other than `~/.codex`.

## Agent Skill

Copy the complete [`skills/dexcow`](../skills/dexcow) directory into your agent's skills directory. For Codex, the destination is `~/.codex/skills/dexcow`. Then ask:

```text
Use $dexcow to review my local Codex sessions and help me remove the ones I choose.
```

The skill requires Bun, but not the dexcow CLI. Its bundled runner shares the CLI's session discovery and deletion code. It lists sessions first and asks for confirmation before deleting.

## Storage Errors

Dexcow briefly retries a busy state database. If it remains unavailable, wait and try again. An unsupported-schema error means the Codex storage format has changed; check for a compatible dexcow update.

See [Architecture](architecture.md) for the files and database records involved.
