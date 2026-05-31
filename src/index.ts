import type { ExtensionContext } from 'vscode'
import { GitConflictController } from './conflictPanel'
import { GitDetailsPanel } from './detailsPanel'
import { GitHistoryProvider } from './historyView'
import { RepositoryRegistry } from './repositoryRegistry'

export function activate(context: ExtensionContext): void {
  const repositories = new RepositoryRegistry(context)
  repositories.register()

  new GitHistoryProvider(context, repositories).register()
  new GitDetailsPanel(context, repositories).register()
  new GitConflictController(context, repositories).register()
}

export function deactivate(): void {}
