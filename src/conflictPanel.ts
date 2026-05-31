import type {
  Disposable,
  ExtensionContext,
  Webview,
  WebviewPanel,
} from 'vscode'
import type { ConflictDetail, GitChange, GitOperation, GitService } from './git'
import type { RepositoryInfo } from './repositoryModel'
import type { RepositoryRegistry } from './repositoryRegistry'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  commands,
  Uri,
  ViewColumn,
  window,
  workspace,
} from 'vscode'

interface ConflictMessage {
  type: string
  path?: string
  root?: string
  content?: string
  side?: 'ours' | 'theirs'
}

interface ConflictFile extends GitChange {
  resolved: boolean
}

interface ConflictSnapshot {
  state: 'ready'
  root: string
  repoName: string
  repositories: RepositoryInfo[]
  selectedRepositoryRoot: string
  operation: GitOperation
  conflicts: ConflictFile[]
  selectedPath?: string
  detail?: ConflictDetail
}

interface EmptyConflictSnapshot {
  state: 'empty'
  reason: string
  repositories: RepositoryInfo[]
  selectedRepositoryRoot?: string
}

export class GitConflictController {
  private panel: WebviewPanel | undefined
  private selectedPath: string | undefined
  private lastConflictKey = ''
  private pollTimer: NodeJS.Timeout | undefined

  constructor(private readonly context: ExtensionContext, private readonly repositories: RepositoryRegistry) {}

  register(): void {
    this.context.subscriptions.push(
      commands.registerCommand('git-forge.sync', () => this.sync()),
      commands.registerCommand('git-forge.openConflicts', () => this.open()),
      commands.registerCommand('git-forge.abortMerge', () => this.abortOperation()),
      workspace.onDidSaveTextDocument(() => this.checkForConflicts()),
      window.onDidChangeWindowState(state => state.focused && this.checkForConflicts()),
      this.repositories.onDidChangeRepositories(() => {
        this.selectedPath = undefined
        this.lastConflictKey = ''
        void this.postCurrentSnapshot()
      }),
      {
        dispose: () => {
          if (this.pollTimer)
            clearInterval(this.pollTimer)
        },
      },
    )

    this.pollTimer = setInterval(() => this.checkForConflicts(), 4000)
    this.checkForConflicts()
  }

  async open(pathToSelect?: string): Promise<void> {
    const service = await this.repositories.currentService()
    if (!service) {
      window.showInformationMessage('Open a Git repository before resolving conflicts.')
      return
    }

    this.selectedPath = pathToSelect ?? this.selectedPath
    this.ensurePanel()
    await this.postSnapshot(service)
  }

  private async sync(): Promise<void> {
    const service = await this.repositories.currentService()
    if (!service) {
      window.showInformationMessage('Open a Git repository before syncing.')
      return
    }

    try {
      await window.withProgress({
        location: { viewId: 'gitForge.history' },
        title: 'Git Forge: syncing',
      }, () => service.syncMerge())
      window.setStatusBarMessage('Git Forge sync complete', 1600)
      await commands.executeCommand('git-forge.refreshHistory').then(undefined, () => undefined)
    }
    catch (error) {
      const status = await service.status().catch(() => undefined)
      if (status?.conflicts.length) {
        this.lastConflictKey = this.conflictKey(service.root, status.conflicts)
        window.showWarningMessage('Merge conflicts detected. Opening Git Forge resolver.')
        await this.open(status.conflicts[0]?.path)
        return
      }

      window.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  private async abortOperation(): Promise<void> {
    const service = await this.repositories.currentService()
    if (!service)
      return

    const operation = await service.currentOperation()
    if (operation.kind === 'none') {
      window.showInformationMessage('No Git operation is in progress.')
      return
    }

    const choice = await window.showWarningMessage(
      `Abort ${operation.label.toLowerCase()}?`,
      { modal: true },
      'Abort',
    )
    if (choice !== 'Abort')
      return

    try {
      await service.abortOperation()
      this.selectedPath = undefined
      await this.postSnapshot(service)
      await commands.executeCommand('git-forge.refreshHistory').then(undefined, () => undefined)
    }
    catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  private async checkForConflicts(): Promise<void> {
    const service = await this.repositories.currentService()
    if (!service)
      return

    const status = await service.status().catch(() => undefined)
    if (!status)
      return

    if (!status.conflicts.length) {
      this.lastConflictKey = ''
      if (this.panel)
        await this.postSnapshot(service)
      return
    }

    const key = this.conflictKey(service.root, status.conflicts)
    if (key === this.lastConflictKey)
      return

    this.lastConflictKey = key
    await this.open(status.conflicts[0]?.path)
  }

  private ensurePanel(): void {
    if (this.panel) {
      this.panel.reveal(ViewColumn.Active)
      return
    }

    const panel = window.createWebviewPanel(
      'gitForge.conflicts',
      'Git Forge Conflicts',
      ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ],
      },
    )

    this.panel = panel
    panel.webview.html = this.html(panel.webview)

    const disposables: Disposable[] = []
    panel.onDidDispose(() => {
      this.panel = undefined
      disposables.forEach(disposable => disposable.dispose())
    }, undefined, disposables)
    panel.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, disposables)
  }

  private async handleMessage(message: ConflictMessage): Promise<void> {
    if (message.type === 'selectRepository' && message.root) {
      await this.selectRepository(message.root)
      return
    }

    const service = await this.repositories.currentService()
    if (!service)
      return

    if (message.type === 'ready' || message.type === 'refresh') {
      await this.postSnapshot(service)
      return
    }

    if (message.type === 'selectConflict' && message.path) {
      this.selectedPath = message.path
      await this.postSnapshot(service)
      return
    }

    if (message.type === 'saveResolution' && message.path && message.content !== undefined) {
      await this.saveResolution(service, message.path, message.content)
      return
    }

    if (message.type === 'acceptSide' && message.path && message.side) {
      await this.acceptSide(service, message.path, message.side)
      return
    }

    if (message.type === 'openSide' && message.path && message.side) {
      await this.openSide(service, message.path, message.side)
      return
    }

    if (message.type === 'abortOperation')
      await this.abortOperation()
  }

  private async selectRepository(root: string): Promise<void> {
    const selected = await this.repositories.selectRepository(root)
    if (!selected)
      return

    this.selectedPath = undefined
    this.lastConflictKey = ''
    await this.postCurrentSnapshot()
    await commands.executeCommand('git-forge.refreshHistory').then(undefined, () => undefined)
  }

  private async saveResolution(service: GitService, filePath: string, content: string): Promise<void> {
    try {
      await service.saveResolution(filePath, content)
      window.setStatusBarMessage(`Resolved ${filePath}`, 1400)
      await this.postSnapshot(service)
      await commands.executeCommand('git-forge.refreshHistory').then(undefined, () => undefined)
    }
    catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  private async acceptSide(service: GitService, filePath: string, side: 'ours' | 'theirs'): Promise<void> {
    try {
      await service.acceptConflictSide(filePath, side)
      window.setStatusBarMessage(`Resolved ${filePath}`, 1400)
      await this.postSnapshot(service)
      await commands.executeCommand('git-forge.refreshHistory').then(undefined, () => undefined)
    }
    catch (error) {
      window.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  private async openSide(service: GitService, filePath: string, side: 'ours' | 'theirs'): Promise<void> {
    const absolutePath = path.resolve(service.root, filePath)
    if (absolutePath !== service.root && !absolutePath.startsWith(`${service.root}${path.sep}`))
      return

    const stage = side === 'ours' ? 2 : 3
    await commands.executeCommand('vscode.open', Uri.from({
      scheme: 'git',
      path: absolutePath,
      query: JSON.stringify({ path: absolutePath, ref: `:${stage}` }),
    }))
  }

  private async postSnapshot(service: GitService): Promise<void> {
    if (!this.panel)
      return

    const selection = await this.repositories.selection()
    await this.panel.webview.postMessage({
      type: 'snapshot',
      snapshot: await this.snapshot(service, selection.repositories, selection.selected?.root ?? service.root),
    })
  }

  private async postCurrentSnapshot(): Promise<void> {
    if (!this.panel)
      return

    const service = await this.repositories.currentService()
    if (service) {
      await this.postSnapshot(service)
      return
    }

    const selection = await this.repositories.selection()
    await this.panel.webview.postMessage({
      type: 'snapshot',
      snapshot: {
        state: 'empty',
        reason: 'Open a folder containing a Git repository before resolving conflicts.',
        repositories: selection.repositories,
      },
    })
  }

  private async snapshot(service: GitService, repositories: RepositoryInfo[], selectedRepositoryRoot: string): Promise<ConflictSnapshot | EmptyConflictSnapshot> {
    const [status, operation] = await Promise.all([
      service.status(),
      service.currentOperation(),
    ])

    if (!status.conflicts.length) {
      return {
        state: 'empty',
        reason: 'No conflicts in the current repository.',
        repositories,
        selectedRepositoryRoot,
      }
    }

    if (!this.selectedPath || !status.conflicts.some(conflict => conflict.path === this.selectedPath))
      this.selectedPath = status.conflicts[0]?.path

    const detail = this.selectedPath
      ? await service.conflictDetail(this.selectedPath).catch(() => undefined)
      : undefined

    return {
      state: 'ready',
      root: service.root,
      repoName: path.basename(service.root),
      repositories,
      selectedRepositoryRoot,
      operation,
      conflicts: status.conflicts.map(conflict => ({
        ...conflict,
        resolved: false,
      })),
      selectedPath: this.selectedPath,
      detail,
    }
  }

  private conflictKey(root: string, conflicts: GitChange[]): string {
    const hash = createHash('sha1')
    hash.update(root)
    hash.update('\0')
    hash.update(conflicts.map(conflict => `${conflict.index}${conflict.worktree}:${conflict.path}`).sort().join('\0'))
    return hash.digest('hex')
  }

  private html(webview: Webview): string {
    const nonce = createNonce()
    const scriptUri = webview.asWebviewUri(Uri.joinPath(
      this.context.extensionUri,
      'dist',
      'webview',
      'details',
      'conflicts.js',
    ))
    const styleUri = webview.asWebviewUri(Uri.joinPath(
      this.context.extensionUri,
      'dist',
      'webview',
      'details',
      'details.css',
    ))
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    ].join('; ')

    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Forge Conflicts</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''
  for (let index = 0; index < 32; index += 1)
    value += chars.charAt(Math.floor(Math.random() * chars.length))
  return value
}
