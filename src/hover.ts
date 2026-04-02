import * as vscode from 'vscode'
import type { LogEntry } from './types.js'

export interface HoverDataSource {
  getEntries: (file: string, line: number) => LogEntry[]
}

export class LogHoverProvider implements vscode.HoverProvider {
  constructor(private readonly source: HoverDataSource) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const entries = this.source.getEntries(document.uri.fsPath, position.line)
    if (entries.length === 0) {
      return null
    }

    const lastEntry = entries.at(-1)!
    const content = new vscode.MarkdownString(undefined, true)
    content.isTrusted = true
    content.appendMarkdown(`**GhostLog**\n\n`)
    content.appendCodeblock(
      entries
        .map((entry) =>
          entry.values.length > 0 ? entry.values.join('\n') : entry.raw
        )
        .join('\n\n'),
      'text'
    )
    content.appendMarkdown(`\n\nLast capture: ${new Date(lastEntry.timestamp).toLocaleString()}`)
    content.appendMarkdown(
      `\n\n[Click to open Log Viewer](command:ghostlog.focusLogViewer)`
    )

    return new vscode.Hover(content)
  }
}
