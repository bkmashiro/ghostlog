import * as vscode from 'vscode'

export interface GhostLogCommandHandlers {
  clearAll: () => void
  toggle: () => void
  clearFile: () => void
}

export function registerCommands(handlers: GhostLogCommandHandlers): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('ghostlog.clear', handlers.clearAll),
    vscode.commands.registerCommand('ghostlog.toggle', handlers.toggle),
    vscode.commands.registerCommand('ghostlog.clearFile', handlers.clearFile)
  ]
}
