# Git Forge

<a href="https://kermanx.github.io/reactive-vscode/" target="__blank"><img src="https://img.shields.io/badge/made_with-reactive--vscode-%23007ACC?style=flat&labelColor=%23229863"  alt="Made with reactive-vscode" /></a>

Git Forge adds compact Git history, branch status, and conflict resolution tools under VS Code's built-in Source Control panel.

## Current MVP

- Native Tree View contributed to the built-in Source Control sidebar.
- Upstream status row and branch comparison row.
- Dense commit list with decorations, author, relative time, and expandable changed files.
- `Cmd+J` details panel with branch status, commit graph, avatars, and hover commit cards.
- Context actions to copy a commit hash or open `git show` in the terminal.

## Development

```bash
corepack pnpm install
corepack pnpm dev
```

Then press `F5` in VS Code and open the built-in Source Control panel. The `Git Forge History` view appears under the native Git changes area.
Press `Cmd+J` on macOS to open the detailed Git Forge panel.

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
