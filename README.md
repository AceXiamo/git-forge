# Git Forge

<a href="https://kermanx.github.io/reactive-vscode/" target="__blank"><img src="https://img.shields.io/badge/made_with-reactive--vscode-%23007ACC?style=flat&labelColor=%23229863"  alt="Made with reactive-vscode" /></a>

Git Forge adds a fast Git history view, a graphical commit details panel, multi-repository switching, upstream sync, and a focused conflict resolver to VS Code.

It is designed to live next to VS Code's built-in Git extension instead of replacing it. The compact history view sits inside the Source Control sidebar, while the richer details and merge tools open only when you need more room.

## Features

- Source Control integration: a native `Git Forge History` tree is contributed under VS Code's built-in Source Control panel.
- Multi-repository workspaces: repositories are discovered from the VS Code Git API and direct child folders, with a persisted repository picker and active-file fallback.
- Branch status: the history view shows the current branch, upstream tracking state, ahead/behind counts, and a compare row for tracked branches.
- Dense commit history: commits include branch/tag decorations, author avatars, relative dates, and expandable changed files.
- Commit actions: copy a commit hash, open `git show --stat --decorate --oneline` in a terminal, or open upstream comparisons with `git log --left-right --graph`.
- Details panel: press `Cmd+J` on macOS or `Ctrl+J` on Windows/Linux to open a resizable Git Forge panel with a virtualized commit graph.
- Commit search: filter commits by message, author, file path, hash, branch/tag, or date. Scoped tokens such as `author:`, `file:`, `hash:`, `branch:`, `message:`, and `date:` are supported.
- Commit inspection: select a commit to review author metadata, additions/deletions, changed files grouped by folder, and per-file diffs against the first parent.
- Large histories: the details panel loads more commits as you scroll, up to 2,000 commits per repository.
- Sync workflow: run `Git Forge: Sync with Upstream` to fetch/prune remotes and merge the configured upstream branch.
- Conflict detection: merge conflicts are detected after sync, saves, and window focus changes, then opened in the Git Forge conflict resolver.
- Conflict resolver: resolve text conflicts in a three-pane local/result/incoming editor, accept either side per hunk, accept both sides in order, ignore a hunk, accept all ours/theirs, or switch to plain text editing.
- Operation safety: abort in-progress merge, rebase, cherry-pick, or revert operations from the resolver after confirmation.
- Binary and non-inline conflicts: open staged ours/theirs versions or keep one side when inline text resolution is not safe.

## Usage

Open a folder or workspace containing one or more Git repositories, then open VS Code's Source Control panel. The `Git Forge History` view appears below the native Git changes area.

Use the repository row or `Git Forge: Switch Repository` when a workspace contains multiple repositories. Git Forge remembers an explicit selection; otherwise it follows the active file when possible.

Open the details panel with `Git Forge: Open Details Panel` or the keyboard shortcut. The graph view supports commit search, infinite loading, file-level review, and opening diffs from the changed-file list.

Use `Git Forge: Open Conflict Resolver` when conflicts are present, or run `Git Forge: Sync with Upstream` to fetch and merge the upstream branch. If conflicts are produced, the resolver opens automatically.

## Development

```bash
corepack pnpm install
corepack pnpm dev
```

Then press `F5` in VS Code and open the built-in Source Control panel. The `Git Forge History` view appears under the native Git changes area.
Press `Cmd+J` on macOS to open the detailed Git Forge panel.

Useful checks:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Build a local VSIX package:

```bash
corepack pnpm ext:package
```

## Release

Version tags must match `package.json`, for example `v0.1.2`.

Pushing a `v*` tag triggers the release workflow. The workflow installs dependencies, validates the tag, runs lint/typecheck/tests, packages the VSIX, publishes to the VS Code Marketplace, optionally publishes to Open VSX when `OVSX_PAT` is configured, and creates a GitHub release with the VSIX attached.

## Configurations

<!-- configs -->

| Key                   | Description                                                    | Type     | Default |
| --------------------- | -------------------------------------------------------------- | -------- | ------- |
| `gitForge.maxCommits` | Maximum number of commits shown in the Git Forge history view. | `number` | `80`    |

<!-- configs -->

## Commands

<!-- commands -->

| Command                      | Title                                  |
| ---------------------------- | -------------------------------------- |
| `git-forge.openDetails`      | Git Forge: Open Details Panel          |
| `git-forge.refreshHistory`   | Git Forge: Refresh History             |
| `git-forge.switchRepository` | Git Forge: Switch Repository           |
| `git-forge.copyCommitHash`   | Git Forge: Copy Commit Hash            |
| `git-forge.showCommit`       | Git Forge: Show Commit in Terminal     |
| `git-forge.sync`             | Git Forge: Sync with Upstream          |
| `git-forge.openConflicts`    | Git Forge: Open Conflict Resolver      |
| `git-forge.abortMerge`       | Git Forge: Abort Current Git Operation |

<!-- commands -->

## License

[MIT](./LICENSE.md)
