import path from 'node:path'
import * as vscode from 'vscode'
import { detectPattern } from './classifier.js'
import { applyLens, LensStore } from './lens.js'
import { registerCommands } from './commands.js'
import { buildDecorationText, getDecorationOptions } from './decorator.js'
import { LogDiffManager, type LogDiff } from './diff.js'
import { LogHoverProvider } from './hover.js'
import { generateInjectionScript } from './injector.js'
import { LogViewerProvider } from './log-viewer.js'
import { LogpointManager, type Logpoint } from './logpoint.js'
import { startMcpServer, type McpServerHandle } from './mcp-server.js'
import { PinStore } from './pin.js'
import { ReplPanelProvider } from './repl-panel.js'
import {
  formatNetworkEntry,
  parseLogLine,
  parseStructuredPayload,
  truncateValue,
  type StructuredPayload
} from './parser.js'
import { classifyDuration } from './perf.js'
import { reviveCapturedValue } from './repl.js'
import {
  findLogLocations,
  findNetworkLocations,
  matchNetworkToLocation,
  matchOutputToLocation,
  summarizeEntryPatterns,
  type LogLocation
} from './tracker.js'
import type { LogEntry, LogLevel } from './types.js'

type EntriesByLine = Map<number, LogEntry[]>

class GhostLogController {
  private readonly decorationTypes: Record<LogLevel, vscode.TextEditorDecorationType>
  private readonly indexedConsoleLocations = new Map<string, LogLocation[]>()
  private readonly indexedNetworkLocations = new Map<string, LogLocation[]>()
  private readonly entriesByFile = new Map<string, EntriesByLine>()
  private readonly terminalBuffers = new Map<string, string>()
  private readonly entryOrder: LogEntry[] = []
  private readonly diffManager = new LogDiffManager()
  private readonly lensStore = new LensStore()
  private readonly pinStore = new PinStore()
  private readonly logViewer: LogViewerProvider
  private readonly logpointManager: LogpointManager
  private readonly replPanel: ReplPanelProvider
  private ghostlogBreakpoints: vscode.SourceBreakpoint[] = []
  private currentDiff?: LogDiff
  private mcpServer?: McpServerHandle
  private enabled: boolean

  constructor(private readonly context: vscode.ExtensionContext) {
    this.enabled = this.getConfig<boolean>('enabled', true)
    const workspaceRoot = this.getWorkspaceRoot()
    if (workspaceRoot) {
      this.lensStore.load(workspaceRoot)
    }
    this.decorationTypes = {
      log: vscode.window.createTextEditorDecorationType(getDecorationOptions('log')),
      info: vscode.window.createTextEditorDecorationType(getDecorationOptions('info')),
      warn: vscode.window.createTextEditorDecorationType(getDecorationOptions('warn')),
      error: vscode.window.createTextEditorDecorationType(getDecorationOptions('error'))
    }
    this.logpointManager = new LogpointManager(this.resolveLogpointStoragePath())
    this.logViewer = new LogViewerProvider(context, {
      clearAll: () => this.clearAll(),
      exportAll: () => this.exportAll(),
      openEntry: (entryId) => this.openEntry(entryId),
      pinPath: (file, line, pinPath) => this.pinPath(file, line, pinPath),
      removePin: (id) => this.removePin(id),
      focusLine: (file, line) => this.focusLineInViewer(file, line)
    })
    this.replPanel = new ReplPanelProvider({
      removePin: (id) => this.removePin(id)
    })
  }

  dispose(): void {
    for (const decorationType of Object.values(this.decorationTypes)) {
      decorationType.dispose()
    }
    if (this.mcpServer) {
      void this.mcpServer.stop()
    }
  }

  register(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    disposables.push(
      ...registerCommands({
        clearAll: () => this.clearAll(),
        toggle: () => this.toggle(),
        clearFile: () => this.clearFile(vscode.window.activeTextEditor?.document.uri.fsPath),
        addLogpoint: () => this.addLogpointHere(),
        addLens: () => this.addLensHere(),
        editLens: () => this.editLensHere(),
        removeLens: () => this.removeLensHere(),
        pinPath: () => this.pinPathHere(),
        snapshotLogs: () => this.snapshotLogs(),
        diffLogs: () => this.diffLogs(),
        startMcp: () => this.startMcp(),
        stopMcp: () => this.stopMcp(),
        focusLogViewer: () => vscode.commands.executeCommand('ghostlog.logViewer.focus'),
        focusLineInViewer: (file, line) => this.focusLineInViewer(file, line)
      })
    )

    disposables.push(
      vscode.window.registerWebviewViewProvider(LogViewerProvider.viewType, this.logViewer),
      vscode.window.registerWebviewViewProvider(ReplPanelProvider.viewType, this.replPanel),
      vscode.languages.registerHoverProvider(
        ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
        new LogHoverProvider({
          getEntries: (file, line) => this.getEntriesForLine(file, line)
        })
      ),
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
          if (this.getConfig<boolean>('mcpEnabled', false)) {
            this.startMcp()
          } else {
            this.stopMcp()
          }
          this.renderAllVisibleEditors()
        }
      }),
      vscode.debug.onDidStartDebugSession((session) => {
        void this.injectDebugRuntime(session)
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
    this.syncLogpointsToBreakpoints()
    if (this.getConfig<boolean>('mcpEnabled', false)) {
      this.startMcp()
    }
    this.refreshViewer()

    return disposables
  }

  private getConfig<T>(key: string, fallback: T): T {
    return vscode.workspace.getConfiguration('ghostlog').get<T>(key, fallback)
  }

  private getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  }

  private isSupportedDocument(document: vscode.TextDocument): boolean {
    return ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'].includes(document.languageId)
  }

  private resolveLogpointStoragePath(): string {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (workspace) {
      return path.join(workspace, '.ghostlog', 'logpoints.json')
    }
    return path.join(this.context.globalStorageUri.fsPath, 'logpoints.json')
  }

  private indexDocument(document: vscode.TextDocument): void {
    if (!this.isSupportedDocument(document)) {
      return
    }
    const filePath = document.uri.fsPath
    const content = document.getText()
    this.indexedConsoleLocations.set(filePath, findLogLocations(content, filePath))
    this.indexedNetworkLocations.set(filePath, findNetworkLocations(content, filePath))
  }

  private clearAll(): void {
    this.entriesByFile.clear()
    this.entryOrder.length = 0
    this.currentDiff = undefined
    this.refreshViewer()
    this.syncReplContext()
    this.renderAllVisibleEditors()
  }

  private clearFile(filePath?: string): void {
    if (!filePath) {
      return
    }
    this.entriesByFile.delete(filePath)
    for (let index = this.entryOrder.length - 1; index >= 0; index -= 1) {
      if (this.entryOrder[index].file === filePath) {
        this.entryOrder.splice(index, 1)
      }
    }
    this.refreshViewer()
    this.syncReplContext()
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
    const level: LogLevel =
      category === 'stderr' ? 'error' : category === 'important' ? 'warn' : 'log'

    const source = body.source as { path?: string } | undefined
    const line = typeof body.line === 'number' ? body.line - 1 : undefined
    if (source?.path && typeof line === 'number') {
      for (const outputLine of rawOutput.split(/\r?\n/)) {
        this.processLineWithKnownLocation(outputLine, source.path, line, level)
      }
      return
    }

    for (const outputLine of rawOutput.split(/\r?\n/)) {
      this.processOutputLine(outputLine, level)
    }
  }

  private processLineWithKnownLocation(
    line: string,
    filePath: string,
    lineNumber: number,
    level: LogLevel
  ): void {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    const structured = parseStructuredPayload(trimmed)
    if (structured) {
      this.processStructuredPayload(structured)
      return
    }

    if (trimmed.startsWith('__ghostlog_logpoint__:')) {
      const entry = this.createLogpointEntry(trimmed, level, filePath, lineNumber)
      this.addEntry(filePath, lineNumber, entry)
      return
    }

    const entry = this.createBaseEntry(trimmed, level, filePath, lineNumber)
    this.addEntry(filePath, lineNumber, entry)
  }

  private processOutputLine(line: string, level: LogLevel): void {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    const structured = parseStructuredPayload(trimmed)
    if (structured) {
      this.processStructuredPayload(structured)
      return
    }

    const entry = parseLogLine(trimmed, level)
    const locations = [...this.indexedConsoleLocations.values()].flat()
    const location = matchOutputToLocation(entry, locations)
    if (!location) {
      return
    }
    this.addEntry(location.file, location.line, this.createBaseEntry(trimmed, level, location.file, location.line))
  }

  private processStructuredPayload(payload: StructuredPayload): void {
    if (payload.type === 'network') {
      const network = {
        url: payload.url ?? '',
        method: (payload.method ?? 'GET').toUpperCase(),
        status: payload.status,
        error: payload.error,
        duration: payload.duration ?? 0,
        timestamp: payload.timestamp ?? Date.now()
      }
      const locations = [...this.indexedNetworkLocations.values()].flat()
      const location = matchNetworkToLocation(network, locations)
      if (!location) {
        return
      }
      this.addEntry(location.file, location.line, {
        raw: formatNetworkEntry(network),
        level: network.error ? 'error' : 'info',
        values: [network.url],
        timestamp: network.timestamp,
        kind: 'network',
        file: location.file,
        line: location.line,
        network
      })
      return
    }

    if (payload.type === 'timing' && payload.phase === 'end' && payload.label) {
      const locations = [...this.indexedConsoleLocations.values()]
        .flat()
        .filter((location) => location.callText.includes('console.timeEnd'))
      const location =
        matchOutputToLocation(parseLogLine(`${payload.label}: ${payload.duration ?? 0}ms`, 'log'), locations) ??
        locations[0]
      if (!location) {
        return
      }

      const duration = payload.duration ?? 0
      this.addEntry(location.file, location.line, {
        raw: `${payload.label}: ${duration}ms`,
        level:
          classifyDuration(duration) === 'slow'
            ? 'error'
            : classifyDuration(duration) === 'medium'
              ? 'warn'
              : 'info',
        values: [`${duration}ms`],
        label: `${payload.label}:`,
        timestamp: payload.timestamp ?? Date.now(),
        kind: 'timing',
        file: location.file,
        line: location.line,
        timing: {
          label: payload.label,
          phase: 'end',
          startTime: payload.startTime,
          endTime: payload.endTime,
          duration
        }
      })
    }
  }

  private createBaseEntry(
    rawLine: string,
    level: LogLevel,
    filePath: string,
    line: number
  ): LogEntry {
    return {
      ...parseLogLine(rawLine, level),
      file: filePath,
      line
    }
  }

  private createLogpointEntry(
    rawLine: string,
    level: LogLevel,
    filePath: string,
    line: number
  ): LogEntry {
    const rest = rawLine.slice('__ghostlog_logpoint__:'.length)
    const [id, expression, ...valueParts] = rest.split(':')
    const value = valueParts.join(':').trim()
    return {
      raw: value || rawLine,
      level,
      values: value ? [value] : [],
      timestamp: Date.now(),
      kind: 'logpoint',
      file: filePath,
      line,
      logpointId: id,
      expression
    }
  }

  private addEntry(filePath: string, line: number, entry: LogEntry): void {
    const nextEntry = this.annotateEntry(filePath, line, entry)
    const byLine = this.entriesByFile.get(filePath) ?? new Map<number, LogEntry[]>()
    const entries = byLine.get(line) ?? []
    byLine.set(line, [...entries, nextEntry])
    this.entriesByFile.set(filePath, byLine)
    this.entryOrder.push(nextEntry)
    this.currentDiff = undefined
    this.refreshViewer()
    this.syncReplContext()
    this.renderEditorForFile(filePath)
  }

  private syncReplContext(): void {
    const recentEntries = this.entryOrder
      .filter((entry) => entry.kind !== 'network' && entry.kind !== 'timing')
      .slice(-25)
      .reverse()
    const values = new Map<string, unknown>()

    for (const [index, entry] of recentEntries.entries()) {
      values.set(this.toReplKey(entry, index), entry.parsedValue ?? entry.raw)
    }

    this.replPanel.updateValues(values)
    this.replPanel.updatePins(this.pinStore.list())
  }

  private toReplKey(entry: LogEntry, index: number): string {
    const fileName = entry.file ? path.basename(entry.file).replace(/[^A-Za-z0-9_$]/g, '_') : 'unknown'
    const line = typeof entry.line === 'number' ? entry.line + 1 : index
    return `$${fileName}_${line}`
  }

  private getEntriesForLine(filePath: string, line: number): LogEntry[] {
    return this.entriesByFile.get(filePath)?.get(line) ?? []
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
    for (const level of Object.keys(this.decorationTypes) as LogLevel[]) {
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
          const command = this.buildLineViewerCommand(editor.document.uri.fsPath, lineNumber)
          const hover = new vscode.MarkdownString(`[Open in Log Viewer](${command})`)
          hover.isTrusted = true
          decorations.push({
            range: new vscode.Range(line.range.end, line.range.end),
            hoverMessage: hover,
            renderOptions: {
              after: {
                contentText: buildDecorationText(
                  entries
                    .slice(-this.getConfig<number>('maxLoopValues', 5))
                    .map((entry) => this.truncateEntry(entry)),
                  {
                    patternSummary: summarizeEntryPatterns(entries)
                  }
                )
              }
            }
          })
        }
      }
      editor.setDecorations(this.decorationTypes[level], decorations)
    }
  }

  private truncateEntry(entry: LogEntry): LogEntry {
    if (entry.kind === 'network' || entry.kind === 'timing') {
      return entry
    }
    const maxValueLength = this.getConfig<number>('maxValueLength', 60)
    return {
      ...entry,
      values: entry.values.map((value) => truncateValue(value, maxValueLength))
    }
  }

  private async addLogpointHere(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }

    const expression = await vscode.window.showInputBox({
      prompt: 'Expression to log at this line',
      placeHolder: 'user.id'
    })
    if (!expression) {
      return
    }

    this.logpointManager.add(editor.document.uri.fsPath, editor.selection.active.line, expression)
    this.syncLogpointsToBreakpoints()
    vscode.window.showInformationMessage('GhostLog logpoint added.')
  }

  private async addLensHere(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }
    const line = editor.selection.active.line
    const existing = this.lensStore.getForLine(editor.document.uri.fsPath, line)
    const expression = await vscode.window.showInputBox({
      prompt: 'Lens expression for this line',
      placeHolder: '.users.length or x => x.name',
      value: existing?.expression ?? ''
    })
    if (!expression) {
      return
    }
    if (existing) {
      this.lensStore.update(existing.id, expression, existing.label)
    } else {
      this.lensStore.add(editor.document.uri.fsPath, line, expression)
    }
    this.saveLenses()
    this.rebuildLineEntries(editor.document.uri.fsPath, line)
    this.renderEditorForFile(editor.document.uri.fsPath)
    this.refreshViewer()
  }

  private async editLensHere(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }
    const lens = this.lensStore.getForLine(editor.document.uri.fsPath, editor.selection.active.line)
    if (!lens) {
      vscode.window.showWarningMessage('GhostLog has no lens on this line.')
      return
    }
    const expression = await vscode.window.showInputBox({
      prompt: 'Edit lens expression',
      value: lens.expression
    })
    if (!expression) {
      return
    }
    this.lensStore.update(lens.id, expression, lens.label)
    this.saveLenses()
    this.rebuildLineEntries(editor.document.uri.fsPath, editor.selection.active.line)
    this.renderEditorForFile(editor.document.uri.fsPath)
    this.refreshViewer()
  }

  private removeLensHere(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }
    const lens = this.lensStore.getForLine(editor.document.uri.fsPath, editor.selection.active.line)
    if (!lens) {
      vscode.window.showWarningMessage('GhostLog has no lens on this line.')
      return
    }
    this.lensStore.remove(lens.id)
    this.saveLenses()
    this.rebuildLineEntries(editor.document.uri.fsPath, editor.selection.active.line)
    this.renderEditorForFile(editor.document.uri.fsPath)
    this.refreshViewer()
  }

  private async pinPathHere(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return
    }
    const pinPath = await vscode.window.showInputBox({
      prompt: 'Path to subscribe for this log line',
      placeHolder: 'response.users[0].status'
    })
    if (!pinPath) {
      return
    }
    this.pinPath(editor.document.uri.fsPath, editor.selection.active.line, pinPath)
  }

  private syncLogpointsToBreakpoints(): void {
    if (this.ghostlogBreakpoints.length > 0) {
      vscode.debug.removeBreakpoints(this.ghostlogBreakpoints)
    }
    this.ghostlogBreakpoints = this.logpointManager.list().map((logpoint) => this.toBreakpoint(logpoint))
    if (this.ghostlogBreakpoints.length > 0) {
      vscode.debug.addBreakpoints(this.ghostlogBreakpoints)
    }
  }

  private toBreakpoint(logpoint: Logpoint): vscode.SourceBreakpoint {
    const location = new vscode.Location(vscode.Uri.file(logpoint.file), new vscode.Position(logpoint.line, 0))
    const logMessage = `__ghostlog_logpoint__:${logpoint.id}:${logpoint.expression}: {${logpoint.expression}}`
    return new vscode.SourceBreakpoint(location, logpoint.enabled, undefined, undefined, logMessage)
  }

  private snapshotLogs(): void {
    const snapshot = this.diffManager.saveSnapshot(this.entryOrder)
    vscode.window.showInformationMessage(`GhostLog snapshot saved (${snapshot.id}).`)
  }

  private diffLogs(): void {
    const previous = this.diffManager.getLastSnapshot()
    if (!previous) {
      vscode.window.showWarningMessage('GhostLog has no snapshot yet.')
      return
    }
    this.currentDiff = this.diffManager.diff(previous, {
      id: 'current',
      timestamp: Date.now(),
      entries: [...this.entryOrder]
    })
    this.refreshViewer()
    void vscode.commands.executeCommand('ghostlog.logViewer.focus')
  }

  private async exportAll(): Promise<void> {
    await vscode.env.clipboard.writeText(JSON.stringify(this.entryOrder, null, 2))
    vscode.window.showInformationMessage('GhostLog logs copied as JSON.')
  }

  private openEntry(entryId: string): void {
    const index = Number(entryId.split(':', 1)[0])
    const entry = this.entryOrder[index]
    if (!entry?.file || typeof entry.line !== 'number') {
      return
    }
    void vscode.window.showTextDocument(vscode.Uri.file(entry.file)).then((editor) => {
      const position = new vscode.Position(entry.line!, 0)
      editor.selection = new vscode.Selection(position, position)
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter)
    })
  }

  private refreshViewer(): void {
    this.logViewer.update(this.entryOrder, this.currentDiff, this.pinStore.list())
    this.replPanel.updatePins(this.pinStore.list())
  }

  private annotateEntry(filePath: string, line: number, entry: LogEntry, trackPins = true): LogEntry {
    const parsedValue = this.deriveParsedValue(entry)
    const nextEntry: LogEntry = { ...entry, parsedValue }

    if (parsedValue !== undefined) {
      nextEntry.patternSignature = detectPattern(parsedValue)
      if (trackPins) {
        this.pinStore.onNewValue(filePath, line, parsedValue)
      }
    }

    const lens = this.lensStore.getForLine(filePath, line)
    if (lens?.enabled && parsedValue !== undefined) {
      const applied = applyLens(parsedValue, lens.expression)
      nextEntry.lens = {
        expression: lens.expression,
        label: lens.label,
        result: applied.result,
        error: applied.error
      }
    }

    return nextEntry
  }

  private deriveParsedValue(entry: LogEntry): unknown {
    if (entry.kind === 'network') {
      return entry.network
    }
    if (entry.kind === 'timing') {
      return entry.timing
    }
    if (entry.values.length === 1) {
      return reviveCapturedValue(entry.values[0] ?? entry.raw)
    }
    if (entry.values.length > 1) {
      return entry.values.map((value) => reviveCapturedValue(value))
    }
    return entry.raw ? reviveCapturedValue(entry.raw) : undefined
  }

  private rebuildLineEntries(filePath: string, line: number): void {
    const byLine = this.entriesByFile.get(filePath)
    const entries = byLine?.get(line)
    if (!entries?.length) {
      return
    }

    const rebuilt = entries.map((entry) => this.annotateEntry(filePath, line, entry, false))
    byLine!.set(line, [...rebuilt])
    for (let index = 0; index < this.entryOrder.length; index += 1) {
      const entry = this.entryOrder[index]
      if (entry.file === filePath && entry.line === line) {
        const next = rebuilt.shift()
        if (next) {
          this.entryOrder[index] = next
        }
      }
    }
  }

  private buildLineViewerCommand(file: string, line: number): string {
    return `command:ghostlog.focusLineInViewer?${encodeURIComponent(JSON.stringify([file, line]))}`
  }

  private focusLineInViewer(file: string, line: number): Thenable<void> {
    this.logViewer.setFocusedLine(file, line)
    return vscode.commands.executeCommand('ghostlog.logViewer.focus')
  }

  private pinPath(file: string, line: number, pinPath: string): void {
    const existing = this.pinStore.getForLine(file, line).find((pin) => pin.path === pinPath)
    if (!existing) {
      this.pinStore.add(file, line, pinPath)
    }
    for (const entry of this.getEntriesForLine(file, line)) {
      if (entry.parsedValue !== undefined) {
        this.pinStore.onNewValue(file, line, entry.parsedValue)
      }
    }
    this.refreshViewer()
    this.syncReplContext()
  }

  private removePin(id: string): void {
    this.pinStore.remove(id)
    this.refreshViewer()
    this.syncReplContext()
  }

  private saveLenses(): void {
    const workspaceRoot = this.getWorkspaceRoot()
    if (!workspaceRoot) {
      return
    }
    this.lensStore.save(workspaceRoot)
  }

  private async injectDebugRuntime(session: vscode.DebugSession): Promise<void> {
    try {
      await session.customRequest('evaluate', {
        expression: generateInjectionScript(),
        context: 'repl'
      })
    } catch {
      // Best effort; not all debug adapters support evaluate here.
    }
  }

  private startMcp(): void {
    if (this.mcpServer) {
      return
    }
    const port = this.getConfig<number>('mcpPort', 5678)
    this.mcpServer = startMcpServer(port, {
      getRecentLogs: () => [...this.entryOrder],
      getErrors: () => this.entryOrder.filter((entry) => entry.level === 'error'),
      getNetworkRequests: () =>
        this.entryOrder.flatMap((entry) => (entry.network ? [entry.network] : [])),
      searchLogs: (query) =>
        this.entryOrder.filter((entry) =>
          JSON.stringify(entry).toLowerCase().includes(query.toLowerCase())
        )
    })
    vscode.window.showInformationMessage(`GhostLog MCP server listening on 127.0.0.1:${port}.`)
  }

  private stopMcp(): void {
    if (!this.mcpServer) {
      return
    }
    const server = this.mcpServer
    this.mcpServer = undefined
    void server.stop().then(() => {
      vscode.window.showInformationMessage('GhostLog MCP server stopped.')
    })
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const controller = new GhostLogController(context)
  context.subscriptions.push(controller, ...controller.register())
}

export function deactivate(): void {}
