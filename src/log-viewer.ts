import * as vscode from 'vscode'
import type { LogDiff } from './diff.js'
import type { LogEntry } from './types.js'

export interface LogViewerActions {
  clearAll: () => void
  exportAll: () => Promise<void>
  openEntry: (entryId: string) => void
}

export class LogViewerProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ghostlog.logViewer'
  private view?: vscode.WebviewView
  private entries: LogEntry[] = []
  private diff?: LogDiff

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly actions: LogViewerActions
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = { enableScripts: true }
    view.webview.onDidReceiveMessage((message) => {
      if (message.type === 'clear') {
        this.actions.clearAll()
      } else if (message.type === 'export') {
        void this.actions.exportAll()
      } else if (message.type === 'open' && typeof message.entryId === 'string') {
        this.actions.openEntry(message.entryId)
      }
    })
    this.render()
  }

  update(entries: LogEntry[], diff?: LogDiff): void {
    this.entries = [...entries]
    this.diff = diff
    this.render()
  }

  private render(): void {
    if (!this.view) {
      return
    }

    const rows = this.entries
      .map((entry, index) => {
        const id = `${index}:${entry.file ?? ''}:${entry.line ?? -1}:${entry.timestamp}`
        const value = escapeHtml(
          entry.kind === 'network'
            ? entry.network
              ? `${entry.network.method} ${entry.network.status ?? 'ERR'} ${entry.network.duration}ms ${entry.network.url}`
              : entry.raw
            : entry.values.join(' ') || entry.raw
        )
        const fileLine = escapeHtml(
          `${entry.file ? vscode.workspace.asRelativePath(entry.file) : 'unknown'}:${(entry.line ?? 0) + 1}`
        )
        const time = escapeHtml(new Date(entry.timestamp).toLocaleTimeString())
        const level = escapeHtml(entry.level.toUpperCase())
        const rowClass = entry.level
        return `<tr class="row ${rowClass}" data-entry-id="${id}">
          <td>${time}</td>
          <td>${fileLine}</td>
          <td>${level}</td>
          <td title="${value}">${value}</td>
        </tr>`
      })
      .join('')

    const diffBanner = this.diff
      ? `<div class="diff">Diff mode: +${this.diff.added.length} / -${this.diff.removed.length} / ~${this.diff.changed.length}</div>`
      : ''

    this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); margin: 0; padding: 12px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
    input { flex: 1; padding: 6px; }
    button { padding: 6px 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
    .row { cursor: pointer; }
    .log td:nth-child(3) { color: #4c8dff; }
    .warn td:nth-child(3) { color: #d2a73b; }
    .error td:nth-child(3) { color: #dc5b5b; }
    .diff { margin-bottom: 8px; font-size: 12px; opacity: 0.85; }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="filter" type="search" placeholder="Filter logs" />
    <button id="clear">Clear All</button>
    <button id="export">Export</button>
  </div>
  ${diffBanner}
  <table>
    <thead>
      <tr><th>Time</th><th>File:Line</th><th>Level</th><th>Value</th></tr>
    </thead>
    <tbody id="rows">${rows}</tbody>
  </table>
  <script>
    const vscode = acquireVsCodeApi();
    const filter = document.getElementById('filter');
    const rows = Array.from(document.querySelectorAll('.row'));
    filter.addEventListener('input', () => {
      const query = filter.value.toLowerCase();
      for (const row of rows) {
        row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
      }
    });
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    document.getElementById('export').addEventListener('click', () => vscode.postMessage({ type: 'export' }));
    for (const row of rows) {
      row.addEventListener('click', () => {
        vscode.postMessage({ type: 'open', entryId: row.dataset.entryId });
      });
    }
  </script>
</body>
</html>`
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
