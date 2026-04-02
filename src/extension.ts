import * as vscode from 'vscode'
import { registerCommands } from './commands.js'
import { buildDecorationText, getDecorationOptions } from './decorator.js'
import { parseLogLine, truncateValue, type LogEntry } from './parser.js'
import { findLogLocations, matchOutputToLocation, type LogLocation } from './tracker.js'

type EntriesByLine = Map<number, LogEntry[]>

class GhostLogController {
  private readonly decorationTypes: Record<LogEntry['level'], vscode.TextEditorDecorationType>
  private readonly indexedLocations = new Map<string, LogLocation[]>()
  private readonly entriesByFile = new Map<string, EntriesByLine>()
  private readonly terminalBuffers = new Map<string, string>()
  private enabled: boolean

  constructor(private readonly context: vscode.ExtensionContext) {
    this.enabled = this.getConfig<boolean>('enabled', true)
    this.decorationTypes = {
      log: vscode.window.createTextEditorDecorationType(getDecorationOptions('log')),
      info: vscode.window.createTextEditorDecorationType(getDecorationOptions('info')),
      warn: vscode.window.createTextEditorDecorationType(getDecorationOptions('warn')),
      error: vscode.window.createTextEditorDecorationType(getDecorationOptions('error'))
    }
  }

  dispose(): void {
    for (const decorationType of Object.values(this.decorationTypes)) {
      decorationType.dispose()
    }
  }

  register(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    disposables.push(
      ...registerCommands({
        clearAll: () => this.clearAll(),
        toggle: () => this.toggle(),
        clearFile: () => this.clearFile(vscode.window.activeTextEditor?.document.uri.fsPath)
      })
    )

    disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.indexDocument(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.indexDocument(document)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.clearFile(event.document.uri.fsPath)
        this.indexDocument(event.document)
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.renderAllVisibleEditors()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('ghostlog')) {
          this.enabled = this.getConfig<boolean>('enabled', true)
          this.renderAllVisibleEditors()
        }
      })
    )

    if ('onDidWriteTerminalData' in vscode.window) {
      const terminalEmitter = (vscode.window as typeof vscode.window & {
        onDidWriteTerminalData?: (
          listener: (event: { terminal: vscode.Terminal; data: string }) => void
        ) => vscode.Disposable
      }).onDidWriteTerminalData

      if (terminalEmitter) {
        disposables.push(
          terminalEmitter((event) => {
            this.captureTerminalOutput(event.terminal, event.data)
          })
        )
      }
    }

    disposables.push(
      vscode.debug.registerDebugAdapterTrackerFactory('*', {
        createDebugAdapterTracker: () => ({
          onDidSendMessage: (message) => {
            if (message.type === 'event' && message.event === 'output') {
              this.captureDebugOutput(message.body)
            }
          }
        })
      })
    )

    for (const document of vscode.workspace.textDocuments) {
      this.indexDocument(document)
    }

    return disposables
  }

  private getConfig<T>(key: string, fallback: T): T {
    return vscode.workspace.getConfiguration('ghostlog').get<T>(key, fallback)
  }

  private isSupportedDocument(document: vscode.TextDocument): boolean {
    return ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId)
  }

  private indexDocument(document: vscode.TextDocument): void {
    if (!this.isSupportedDocument(document)) {
      return
    }
    this.indexedLocations.set(
      document.uri.fsPath,
      findLogLocations(document.getText(), document.uri.fsPath)
    )
  }

  private clearAll(): void {
    this.entriesByFile.clear()
    this.renderAllVisibleEditors()
  }

  private clearFile(filePath?: string): void {
    if (!filePath) {
      return
    }
    this.entriesByFile.delete(filePath)
    this.renderAllVisibleEditors()
  }

  private toggle(): void {
    this.enabled = !this.enabled
    void vscode.workspace
      .getConfiguration('ghostlog')
      .update('enabled', this.enabled, vscode.ConfigurationTarget.Global)
    this.renderAllVisibleEditors()
  }

  private captureTerminalOutput(terminal: vscode.Terminal, data: string): void {
    const terminalKey = terminal.name
    const previous = this.terminalBuffers.get(terminalKey) ?? ''
    const combined = previous + data
    const lines = combined.split(/\r?\n/)
    const remainder = lines.pop() ?? ''
    this.terminalBuffers.set(terminalKey, remainder)

    for (const line of lines) {
      this.processOutputLine(line, 'log')
    }
  }

  private captureDebugOutput(body: Record<string, unknown>): void {
    const rawOutput = typeof body.output === 'string' ? body.output : ''
    const category = typeof body.category === 'string' ? body.category : 'console'
    const level: LogEntry['level'] =
      category === 'stderr' ? 'error' : category === 'important' ? 'warn' : 'log'

    const source = body.source as { path?: string } | undefined
    const line = typeof body.line === 'number' ? body.line - 1 : undefined
    if (source?.path && typeof line === 'number') {
      const entry = this.normalizeEntry(parseLogLine(rawOutput, level))
      this.addEntry(source.path, line, entry)
      return
    }

    for (const outputLine of rawOutput.split(/\r?\n/)) {
      this.processOutputLine(outputLine, level)
    }
  }

  private normalizeEntry(entry: LogEntry): LogEntry {
    const maxValueLength = this.getConfig<number>('maxValueLength', 60)
    return {
      ...entry,
      values: entry.values.map((value) => truncateValue(value, maxValueLength))
    }
  }

  private processOutputLine(line: string, level: LogEntry['level']): void {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    const entry = this.normalizeEntry(parseLogLine(trimmed, level))
    const locations = [...this.indexedLocations.values()].flat()
    const location = matchOutputToLocation(entry, locations)
    if (!location) {
      return
    }
    this.addEntry(location.file, location.line, entry)
  }

  private addEntry(filePath: string, line: number, entry: LogEntry): void {
    const byLine = this.entriesByFile.get(filePath) ?? new Map<number, LogEntry[]>()
    const entries = byLine.get(line) ?? []
    byLine.set(line, [...entries, entry])
    this.entriesByFile.set(filePath, byLine)
    this.renderEditorForFile(filePath)
  }

  private renderAllVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.renderEditor(editor)
    }
  }

  private renderEditorForFile(filePath: string): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.fsPath === filePath) {
        this.renderEditor(editor)
      }
    }
  }

  private renderEditor(editor: vscode.TextEditor): void {
    for (const level of Object.keys(this.decorationTypes) as LogEntry['level'][]) {
      if (!this.enabled) {
        editor.setDecorations(this.decorationTypes[level], [])
        continue
      }

      const byLine = this.entriesByFile.get(editor.document.uri.fsPath)
      const decorations: vscode.DecorationOptions[] = []
      if (byLine) {
        for (const [lineNumber, entries] of byLine.entries()) {
          const line = editor.document.lineAt(lineNumber)
          const levelForLine =
            entries.find((entry) => entry.level === 'error')?.level ??
            entries.find((entry) => entry.level === 'warn')?.level ??
            entries[0]?.level
          if (levelForLine !== level) {
            continue
          }
          decorations.push({
            range: new vscode.Range(line.range.end, line.range.end),
            renderOptions: {
              after: {
                contentText: buildDecorationText(
                  entries.slice(-this.getConfig<number>('maxLoopValues', 5))
                )
              }
            }
          })
        }
      }
      editor.setDecorations(this.decorationTypes[level], decorations)
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const controller = new GhostLogController(context)
  context.subscriptions.push(controller, ...controller.register())
}

export function deactivate(): void {}
