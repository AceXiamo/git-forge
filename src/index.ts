import type { ExtensionContext } from 'vscode'
import { GitDetailsPanel } from './detailsPanel'
import { GitHistoryProvider } from './historyView'

export function activate(context: ExtensionContext): void {
  new GitHistoryProvider(context).register()
  new GitDetailsPanel(context).register()
}

export function deactivate(): void {}
