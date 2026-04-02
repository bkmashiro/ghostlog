import * as vscode from 'vscode'

export interface GhostLogCommandHandlers {
  clearAll: () => void
  toggle: () => void
  clearFile: () => void
  exportLogs: () => Thenable<void> | void
  timeTravel: () => Thenable<void> | void
  addLogpoint: () => Thenable<void> | void
  addLens: () => Thenable<void> | void
  editLens: () => Thenable<void> | void
  removeLens: () => Thenable<void> | void
  pinPath: () => Thenable<void> | void
  snapshotLogs: () => void
  diffLogs: () => void
  startMcp: () => void
  stopMcp: () => void
  focusLogViewer: () => Thenable<void> | void
  focusLineInViewer: (file: string, line: number) => Thenable<void> | void
}

export function registerCommands(handlers: GhostLogCommandHandlers): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('ghostlog.clear', handlers.clearAll),
    vscode.commands.registerCommand('ghostlog.toggle', handlers.toggle),
    vscode.commands.registerCommand('ghostlog.clearFile', handlers.clearFile),
    vscode.commands.registerCommand('ghostlog.exportLogs', handlers.exportLogs),
    vscode.commands.registerCommand('ghostlog.timeTravel', handlers.timeTravel),
    vscode.commands.registerCommand('ghostlog.addLogpoint', handlers.addLogpoint),
    vscode.commands.registerCommand('ghostlog.addLens', handlers.addLens),
    vscode.commands.registerCommand('ghostlog.editLens', handlers.editLens),
    vscode.commands.registerCommand('ghostlog.removeLens', handlers.removeLens),
    vscode.commands.registerCommand('ghostlog.pinPath', handlers.pinPath),
    vscode.commands.registerCommand('ghostlog.snapshotLogs', handlers.snapshotLogs),
    vscode.commands.registerCommand('ghostlog.diffLogs', handlers.diffLogs),
    vscode.commands.registerCommand('ghostlog.startMcp', handlers.startMcp),
    vscode.commands.registerCommand('ghostlog.stopMcp', handlers.stopMcp),
    vscode.commands.registerCommand('ghostlog.focusLogViewer', handlers.focusLogViewer),
    vscode.commands.registerCommand('ghostlog.focusLineInViewer', handlers.focusLineInViewer)
  ]
}
