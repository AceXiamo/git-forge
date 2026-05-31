# Git Forge

Git Forge is a compact Git companion for VS Code. It adds a clearer commit history, repository switcher, upstream status, sync workflow, and conflict resolver while staying next to VS Code's built-in Source Control tools.

## What It Adds

- Git history inside the Source Control panel, with the selected repository, branch status, ahead/behind counts, commit authors, relative dates, and changed files.
- Multi-repository switching for workspaces that contain more than one Git repository.
- A details panel with a virtualized commit graph, author avatars, commit search, file statistics, and file-level diffs.
- Fast commit actions for copying hashes, opening `git show`, and comparing a branch with its upstream.
- Upstream sync that fetches/prunes remotes and merges the configured upstream branch.
- Automatic conflict detection after sync, save, and focus changes.
- A three-pane conflict resolver for text conflicts, with local/result/incoming panes, per-hunk choices, accept-all actions, plain-text editing, and operation abort support.
- Safe fallback actions for binary or non-inline conflicts, including opening staged versions and keeping either side.

## Getting Started

Open a folder or workspace containing one or more Git repositories, then open VS Code's Source Control panel. The `Git Forge History` view appears below the native Git changes area.

Press `Cmd+J` on macOS or `Ctrl+J` on Windows/Linux to open the larger details panel. Use it to search commits, inspect file changes, and open diffs against the first parent.

Run `Git Forge: Sync with Upstream` to update from the tracked upstream branch. If conflicts appear, Git Forge opens the resolver automatically.

## Commit Search

The details panel can search commit messages, authors, files, hashes, branch/tag decorations, and dates. Scoped tokens are supported:

- `author:alice`
- `file:src/git.ts`
- `hash:abc123`
- `branch:main`
- `message:conflict`
- `date:yesterday`

## Development

For local development, run `corepack pnpm install`, then `corepack pnpm dev`, press `F5` in VS Code, and open the Source Control panel.

Before publishing, run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm ext:package`.

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
