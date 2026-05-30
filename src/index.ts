import type { ExtensionContext } from 'vscode'
import { GitConflictController } from './conflictPanel'
import { GitDetailsPanel } from './detailsPanel'
import { GitHistoryProvider } from './historyView'

export function activate(context: ExtensionContext): void {
  new GitHistoryProvider(context).register()
  new GitDetailsPanel(context).register()
  new GitConflictController(context).register()
}

export function deactivate(): void {}
