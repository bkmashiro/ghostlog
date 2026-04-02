import * as vscode from 'vscode'

export interface GhostLogCommandHandlers {
  clearAll: () => void
  toggle: () => void
  clearFile: () => void
  addLogpoint: () => Thenable<void> | void
  snapshotLogs: () => void
  diffLogs: () => void
  startMcp: () => void
  stopMcp: () => void
  focusLogViewer: () => Thenable<void> | void
}

export function registerCommands(handlers: GhostLogCommandHandlers): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('ghostlog.clear', handlers.clearAll),
    vscode.commands.registerCommand('ghostlog.toggle', handlers.toggle),
    vscode.commands.registerCommand('ghostlog.clearFile', handlers.clearFile),
    vscode.commands.registerCommand('ghostlog.addLogpoint', handlers.addLogpoint),
    vscode.commands.registerCommand('ghostlog.snapshotLogs', handlers.snapshotLogs),
    vscode.commands.registerCommand('ghostlog.diffLogs', handlers.diffLogs),
    vscode.commands.registerCommand('ghostlog.startMcp', handlers.startMcp),
    vscode.commands.registerCommand('ghostlog.stopMcp', handlers.stopMcp),
    vscode.commands.registerCommand('ghostlog.focusLogViewer', handlers.focusLogViewer)
  ]
}
