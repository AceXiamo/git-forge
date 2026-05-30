import type {
  CancellationToken,
  Disposable,
  ExtensionContext,
  Webview,
  WebviewView,
  WebviewViewProvider,
  WebviewViewResolveContext,
} from 'vscode'
import type { GitCommit, GitSnapshot } from './git'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  commands,
  env,
  Uri,
  window,
  workspace,
} from 'vscode'
import { GitService } from './git'

interface DetailsMessage {
  type: string
  hash?: string
  parentHash?: string
  path?: string
  text?: string
}

interface DetailsCommit extends GitCommit {
  avatarUrl: string
}

interface DetailsSnapshot extends Omit<GitSnapshot, 'commits'> {
  commits: DetailsCommit[]
}

export class GitDetailsPanel implements WebviewViewProvider {
  private view: WebviewView | undefined
  private maxCommits = 0

  constructor(private readonly context: ExtensionContext) {}

  register(): void {
    this.context.subscriptions.push(
      window.registerWebviewViewProvider('gitForge.details', this, {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }),
      commands.registerCommand('git-forge.openDetails', () => this.open()),
    )
  }

  async open(): Promise<void> {
    await commands.executeCommand('workbench.view.extension.git-forge-details').then(undefined, () => undefined)
    await commands.executeCommand('gitForge.details.focus').then(undefined, () => undefined)
    await this.postSnapshot()
  }

  resolveWebviewView(
    view: WebviewView,
    _context: WebviewViewResolveContext,
    _token: CancellationToken,
  ): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
      ],
    }
    view.webview.html = this.html(view.webview)

    const disposables: Disposable[] = []
    view.onDidDispose(() => {
      this.view = undefined
      disposables.forEach(disposable => disposable.dispose())
    }, undefined, disposables)
    view.webview.onDidReceiveMessage(message => this.handleMessage(message), undefined, disposables)
  }

  private async handleMessage(message: DetailsMessage): Promise<void> {
    if (message.type === 'ready' || message.type === 'refresh')
      await this.postSnapshot()
    if (message.type === 'loadMore')
      await this.loadMore()
    if (message.type === 'openCommitFile')
      await this.openCommitFile(message)
    if (message.type === 'copyText')
      await this.copyText(message)
  }

  private async loadMore(): Promise<void> {
    const pageSize = this.configuredMaxCommits()
    this.maxCommits = Math.min(2000, this.currentMaxCommits() + pageSize)
    await this.postSnapshot()
  }

  private async copyText(message: DetailsMessage): Promise<void> {
    if (!message.text)
      return

    await env.clipboard.writeText(message.text)
    window.setStatusBarMessage('Copied to clipboard', 1400)
  }

  private async openCommitFile(message: DetailsMessage): Promise<void> {
    if (!message.hash || !message.path)
      return

    const workspacePath = this.currentWorkspacePath()
    if (!workspacePath)
      return

    const service = await GitService.fromWorkspace(workspacePath)
    if (!service)
      return

    const absolutePath = path.resolve(service.root, message.path)
    if (absolutePath !== service.root && !absolutePath.startsWith(`${service.root}${path.sep}`))
      return

    const leftRef = message.parentHash || `${message.hash}^`
    const rightRef = message.hash
    const left = gitUri(absolutePath, leftRef)
    const right = gitUri(absolutePath, rightRef)
    const title = `${message.path} (${shortRef(leftRef)} ↔ ${shortRef(rightRef)})`

    await commands.executeCommand('vscode.diff', left, right, title)
  }

  private async postSnapshot(): Promise<void> {
    if (!this.view)
      return

    const snapshot = await this.snapshot()
    await this.view.webview.postMessage({ type: 'snapshot', snapshot })
  }

  private async snapshot(): Promise<DetailsSnapshot | { state: 'empty', reason: string }> {
    const workspacePath = this.currentWorkspacePath()
    if (!workspacePath) {
      return {
        state: 'empty',
        reason: 'Open a VS Code folder before using Git Forge.',
      }
    }

    const service = await GitService.fromWorkspace(workspacePath)
    if (!service) {
      return {
        state: 'empty',
        reason: 'The current workspace is not inside a Git repository.',
      }
    }

    return decorateSnapshot(await service.snapshot(this.currentMaxCommits()))
  }

  private currentMaxCommits(): number {
    if (!this.maxCommits)
      this.maxCommits = this.configuredMaxCommits()
    return this.maxCommits
  }

  private configuredMaxCommits(): number {
    return workspace.getConfiguration('gitForge').get<number>('maxCommits', 80)
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

  private html(webview: Webview): string {
    const nonce = createNonce()
    const scriptUri = webview.asWebviewUri(Uri.joinPath(
      this.context.extensionUri,
      'dist',
      'webview',
      'details',
      'details.js',
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
      `img-src ${webview.cspSource} https://www.gravatar.com data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    ].join('; ')

    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git Forge Details</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function gitUri(filePath: string, ref: string): Uri {
  return Uri.from({
    scheme: 'git',
    path: filePath,
    query: JSON.stringify({ path: filePath, ref }),
  })
}

function shortRef(ref: string): string {
  return ref.length > 7 ? ref.slice(0, 7) : ref
}

function decorateSnapshot(snapshot: GitSnapshot): DetailsSnapshot {
  return {
    ...snapshot,
    commits: snapshot.commits.map(commit => ({
      ...commit,
      avatarUrl: gravatarUrl(commit.authorEmail),
    })),
  }
}

function gravatarUrl(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!normalized)
    return ''

  const hash = createHash('md5').update(normalized).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?s=48&d=identicon`
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''
  for (let index = 0; index < 32; index += 1)
    value += chars.charAt(Math.floor(Math.random() * chars.length))
  return value
}
