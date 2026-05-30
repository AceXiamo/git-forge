import type { Event, ExtensionContext, TreeDataProvider } from 'vscode'
import type { BranchStatus, GitCommit, GitCommitFile, GitSnapshot } from './git'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  commands,
  env,
  EventEmitter,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
  workspace,
} from 'vscode'
import { GitService } from './git'

type HistoryNode = CommitNode | CompareNode | EmptyNode | FileNode | StatusNode

export class GitHistoryProvider implements TreeDataProvider<HistoryNode> {
  private readonly onDidChangeTreeDataEmitter = new EventEmitter<HistoryNode | undefined | void>()
  readonly onDidChangeTreeData: Event<HistoryNode | undefined | void> = this.onDidChangeTreeDataEmitter.event

  private refreshTimer: NodeJS.Timeout | undefined

  constructor(private readonly context: ExtensionContext) {}

  register(): void {
    const tree = window.createTreeView('gitForge.history', {
      treeDataProvider: this,
      showCollapseAll: true,
    })

    this.context.subscriptions.push(
      tree,
      this.onDidChangeTreeDataEmitter,
      commands.registerCommand('git-forge.refreshHistory', () => this.refresh()),
      commands.registerCommand('git-forge.copyCommitHash', node => this.copyCommitHash(node)),
      commands.registerCommand('git-forge.showCommit', node => this.showCommit(node)),
      commands.registerCommand('git-forge.showCompare', node => this.showCompare(node)),
      workspace.onDidSaveTextDocument(() => this.refreshSoon()),
      workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      window.onDidChangeActiveTextEditor(() => this.refreshSoon()),
    )
  }

  refresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = undefined
    }
    this.onDidChangeTreeDataEmitter.fire()
  }

  getTreeItem(element: HistoryNode): TreeItem {
    return element
  }

  async getChildren(element?: HistoryNode): Promise<HistoryNode[]> {
    const service = await this.currentService()
    if (!service)
      return element ? [] : [new EmptyNode('Open a folder inside a Git repository.')]

    if (element instanceof CommitNode) {
      const files = await service.commitFiles(element.commit.hash)
      return files.map(file => new FileNode(file, service.root))
    }

    if (element)
      return []

    const maxCommits = workspace.getConfiguration('gitForge').get<number>('maxCommits', 80)
    const snapshot = await service.snapshot(maxCommits)
    return this.rootNodes(snapshot)
  }

  private rootNodes(snapshot: GitSnapshot): HistoryNode[] {
    const nodes: HistoryNode[] = [new StatusNode(snapshot.branch, snapshot.repoName)]

    if (snapshot.branch.upstream)
      nodes.push(new CompareNode(snapshot.branch))

    if (!snapshot.commits.length) {
      nodes.push(new EmptyNode('No commits yet.'))
      return nodes
    }

    nodes.push(...snapshot.commits.map(commit => new CommitNode(commit)))
    return nodes
  }

  private async copyCommitHash(node?: HistoryNode): Promise<void> {
    if (!(node instanceof CommitNode))
      return

    await env.clipboard.writeText(node.commit.hash)
    void window.showInformationMessage(`Copied ${node.commit.shortHash}`)
  }

  private async showCommit(node?: HistoryNode): Promise<void> {
    if (!(node instanceof CommitNode))
      return

    const service = await this.currentService()
    if (!service)
      return

    const terminal = window.createTerminal({ name: 'Git Forge', cwd: service.root })
    terminal.show()
    terminal.sendText(`git show --stat --decorate --oneline ${node.commit.hash}`)
  }

  private async showCompare(node?: HistoryNode): Promise<void> {
    if (!(node instanceof CompareNode))
      return

    const service = await this.currentService()
    if (!service || !node.branch.upstream)
      return

    const terminal = window.createTerminal({ name: 'Git Forge', cwd: service.root })
    terminal.show()
    terminal.sendText(`git log --left-right --graph --cherry-pick --oneline ${node.branch.upstream}...${node.branch.current}`)
  }

  private refreshSoon(): void {
    if (this.refreshTimer)
      clearTimeout(this.refreshTimer)

    this.refreshTimer = setTimeout(() => this.refresh(), 600)
  }

  private async currentService(): Promise<GitService | undefined> {
    const workspacePath = this.currentWorkspacePath()
    if (!workspacePath)
      return undefined
    return GitService.fromWorkspace(workspacePath)
  }

  private currentWorkspacePath(): string | undefined {
    const activeUri = window.activeTextEditor?.document.uri
    if (activeUri?.scheme === 'file') {
      const folder = workspace.getWorkspaceFolder(activeUri)
      if (folder)
        return folder.uri.fsPath
    }

    return workspace.workspaceFolders?.[0]?.uri.fsPath
  }
}

class StatusNode extends TreeItem {
  constructor(branch: BranchStatus, repoName: string) {
    super(statusLabel(branch), TreeItemCollapsibleState.None)
    this.description = repoName
    this.iconPath = new ThemeIcon(branch.upstream ? 'cloud' : 'git-branch')
    this.tooltip = branch.upstream
      ? `${branch.current} tracking ${branch.upstream}`
      : `${branch.current} has no upstream`
  }
}

class CompareNode extends TreeItem {
  readonly branch: BranchStatus

  constructor(branch: BranchStatus) {
    super(`Compare ${branch.current} with ${branch.upstream}`, TreeItemCollapsibleState.None)
    this.branch = branch
    this.iconPath = new ThemeIcon('git-compare')
    this.description = `${branch.ahead} ahead, ${branch.behind} behind`
    this.command = {
      command: 'git-forge.showCompare',
      title: 'Show Compare',
      arguments: [this],
    }
  }
}

class CommitNode extends TreeItem {
  readonly commit: GitCommit

  constructor(commit: GitCommit) {
    super(commitLabel(commit), TreeItemCollapsibleState.Collapsed)
    this.commit = commit
    this.id = commit.hash
    this.contextValue = 'gitForgeCommit'
    this.description = `${commit.author}, ${commit.relativeDate}`
    this.iconPath = gravatarIcon(commit.authorEmail)
    this.tooltip = [
      commit.hash,
      commit.authorEmail ? `${commit.author} <${commit.authorEmail}>` : commit.author,
      commit.relativeDate,
      commit.subject,
      commit.decorations.length ? commit.decorations.join(', ') : '',
    ].filter(Boolean).join('\n')
  }
}

class FileNode extends TreeItem {
  constructor(file: GitCommitFile, root: string) {
    super(path.basename(file.path), TreeItemCollapsibleState.None)
    this.description = path.dirname(file.path) === '.' ? statusText(file.status) : `${path.dirname(file.path)}  ${statusText(file.status)}`
    this.resourceUri = Uri.file(path.join(root, file.path))
    this.tooltip = file.originalPath
      ? `${file.status} ${file.originalPath} -> ${file.path}`
      : `${file.status} ${file.path}`
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [Uri.file(path.join(root, file.path))],
    }
  }
}

class EmptyNode extends TreeItem {
  constructor(message: string) {
    super(message, TreeItemCollapsibleState.None)
    this.iconPath = new ThemeIcon('info')
  }
}

function statusLabel(branch: BranchStatus): string {
  if (!branch.upstream)
    return `No upstream for ${branch.current}`

  if (branch.ahead === 0 && branch.behind === 0)
    return `Up to date with ${branch.upstream}`

  if (branch.ahead > 0 && branch.behind > 0)
    return `${branch.current} diverged from ${branch.upstream}`

  if (branch.ahead > 0)
    return `${branch.ahead} commit${branch.ahead === 1 ? '' : 's'} ahead of ${branch.upstream}`

  return `${branch.behind} commit${branch.behind === 1 ? '' : 's'} behind ${branch.upstream}`
}

function commitLabel(commit: GitCommit): string {
  const decorations = commit.decorations
    .filter(decoration => decoration !== commit.hash)
    .slice(0, 2)

  if (!decorations.length)
    return commit.subject || '(no subject)'

  return `(${decorations.join(', ')}) ${commit.subject || '(no subject)'}`
}

function statusText(status: string): string {
  if (status.startsWith('R'))
    return 'renamed'
  if (status === 'A')
    return 'added'
  if (status === 'D')
    return 'deleted'
  if (status === 'M')
    return 'modified'
  if (status === 'C')
    return 'copied'
  return status
}

function gravatarIcon(email: string): Uri | ThemeIcon {
  const normalized = email.trim().toLowerCase()
  if (!normalized)
    return new ThemeIcon('account')

  const hash = createHash('md5').update(normalized).digest('hex')
  return Uri.parse(`https://www.gravatar.com/avatar/${hash}?s=32&d=identicon`)
}
