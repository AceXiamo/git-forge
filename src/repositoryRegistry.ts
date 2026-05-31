import type {
  Disposable,
  Event,
  ExtensionContext,
  QuickPickItem,
  Uri,
} from 'vscode'
import type { RepositoryCandidate, RepositoryInfo, WorkspaceRoot } from './repositoryModel'
import {
  commands,
  EventEmitter,
  extensions,
  window,
  workspace,
} from 'vscode'
import { GitService } from './git'
import {
  buildRepositoryList,
  discoverFilesystemRepositoryCandidates,
  sameRepositoryRoot,
  selectRepositoryRoot,
} from './repositoryModel'

const SELECTED_REPOSITORY_ROOT_KEY = 'gitForge.selectedRepositoryRoot'

interface GitRepository {
  rootUri: Uri
}

interface GitApi {
  repositories: GitRepository[]
  onDidOpenRepository: Event<GitRepository>
  onDidCloseRepository: Event<GitRepository>
}

interface GitExtension {
  getAPI: (version: 1) => GitApi
}

interface RepositoryQuickPickItem extends QuickPickItem {
  repository: RepositoryInfo
}

export class RepositoryRegistry implements Disposable {
  private readonly onDidChangeRepositoriesEmitter = new EventEmitter<void>()
  readonly onDidChangeRepositories = this.onDidChangeRepositoriesEmitter.event

  private gitApi: GitApi | undefined
  private gitApiPromise: Promise<GitApi | undefined> | undefined
  private readonly gitDisposables: Disposable[] = []
  private transientSelectedRoot: string | undefined

  constructor(private readonly context: ExtensionContext) {}

  register(): void {
    this.context.subscriptions.push(
      this,
      commands.registerCommand('git-forge.switchRepository', () => this.pickRepository()),
      workspace.onDidChangeWorkspaceFolders(() => {
        this.transientSelectedRoot = undefined
        this.refresh()
      }),
      window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.uri.scheme === 'file')
          this.transientSelectedRoot = undefined
        this.refresh()
      }),
    )

    void this.ensureGitApi().then(() => this.refresh())
  }

  dispose(): void {
    this.gitDisposables.splice(0).forEach(disposable => disposable.dispose())
    this.onDidChangeRepositoriesEmitter.dispose()
  }

  refresh(): void {
    this.onDidChangeRepositoriesEmitter.fire()
  }

  async repositories(): Promise<RepositoryInfo[]> {
    const workspaceRoots = this.workspaceRoots()
    const [vscodeCandidates, filesystemCandidates] = await Promise.all([
      this.vscodeRepositoryCandidates(),
      discoverFilesystemRepositoryCandidates(workspaceRoots.map(workspaceRoot => workspaceRoot.path)),
    ])

    return buildRepositoryList([...vscodeCandidates, ...filesystemCandidates], workspaceRoots)
  }

  async selectedRepository(): Promise<RepositoryInfo | undefined> {
    return (await this.selection()).selected
  }

  async selection(): Promise<{ repositories: RepositoryInfo[], selected?: RepositoryInfo }> {
    const repositories = await this.repositories()
    const persistedRoot = this.context.workspaceState.get<string>(SELECTED_REPOSITORY_ROOT_KEY)
    const transientRoot = persistedRoot ? undefined : this.transientSelectedRoot
    const selectedRoot = selectRepositoryRoot(repositories, {
      activeFile: transientRoot ? undefined : this.activeFilePath(),
      persistedRoot: persistedRoot ?? transientRoot,
    })

    if (persistedRoot && !repositories.some(repository => sameRepositoryRoot(repository.root, persistedRoot)))
      await this.context.workspaceState.update(SELECTED_REPOSITORY_ROOT_KEY, undefined)

    const selected = selectedRoot
      ? repositories.find(repository => sameRepositoryRoot(repository.root, selectedRoot))
      : undefined

    this.transientSelectedRoot = selected?.root
    return { repositories, selected }
  }

  async currentService(): Promise<GitService | undefined> {
    const repository = await this.selectedRepository()
    return repository ? GitService.fromRoot(repository.root) : undefined
  }

  async selectRepository(root: string): Promise<boolean> {
    const repositories = await this.repositories()
    const repository = repositories.find(repository => sameRepositoryRoot(repository.root, root))
    if (!repository) {
      window.showWarningMessage('Git Forge could not find that repository in the current workspace.')
      return false
    }

    await this.context.workspaceState.update(SELECTED_REPOSITORY_ROOT_KEY, repository.root)
    this.transientSelectedRoot = repository.root
    this.refresh()
    return true
  }

  async pickRepository(): Promise<void> {
    const repositories = await this.repositories()
    if (!repositories.length) {
      window.showInformationMessage('No Git repositories were found in the current workspace.')
      return
    }

    const selected = await this.selectedRepository()
    const pick = await window.showQuickPick<RepositoryQuickPickItem>(
      repositories.map(repository => ({
        label: repository.label,
        description: repository.description === '.' ? undefined : repository.description,
        detail: repository.root,
        picked: selected ? sameRepositoryRoot(repository.root, selected.root) : false,
        repository,
      })),
      {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Switch Git Forge repository',
      },
    )
    if (!pick)
      return

    await this.selectRepository(pick.repository.root)
  }

  private workspaceRoots(): WorkspaceRoot[] {
    return (workspace.workspaceFolders ?? [])
      .filter(folder => folder.uri.scheme === 'file')
      .map(folder => ({
        name: folder.name,
        path: folder.uri.fsPath,
      }))
  }

  private async vscodeRepositoryCandidates(): Promise<RepositoryCandidate[]> {
    const gitApi = await this.ensureGitApi()
    return gitApi?.repositories
      .filter(repository => repository.rootUri.scheme === 'file')
      .map(repository => ({
        root: repository.rootUri.fsPath,
        source: 'vscode',
      })) ?? []
  }

  private async ensureGitApi(): Promise<GitApi | undefined> {
    if (this.gitApi)
      return this.gitApi

    if (!this.gitApiPromise)
      this.gitApiPromise = this.activateGitApi()

    return this.gitApiPromise
  }

  private async activateGitApi(): Promise<GitApi | undefined> {
    const extension = extensions.getExtension<GitExtension>('vscode.git')
    if (!extension)
      return undefined

    let gitExtension: GitExtension | undefined
    try {
      gitExtension = extension.isActive
        ? extension.exports
        : await extension.activate()
    }
    catch {
      return undefined
    }

    const gitApi = gitExtension?.getAPI?.(1)
    if (!gitApi)
      return undefined

    this.gitApi = gitApi
    this.gitDisposables.push(
      gitApi.onDidOpenRepository(() => this.refresh()),
      gitApi.onDidCloseRepository(() => this.refresh()),
    )
    return gitApi
  }

  private activeFilePath(): string | undefined {
    const activeUri = window.activeTextEditor?.document.uri
    return activeUri?.scheme === 'file' ? activeUri.fsPath : undefined
  }
}
