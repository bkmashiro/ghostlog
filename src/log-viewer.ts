import * as vscode from 'vscode'
import { classifyEntries } from './classifier.js'
import type { LogDiff } from './diff.js'
import type { PinnedPath } from './pin.js'
import { formatValue } from './repl.js'
import type { TimelineFrame } from './time-travel.js'
import type { LogEntry } from './types.js'

export interface LogViewerActions {
  clearAll: () => void
  exportAll: () => Promise<void>
  openEntry: (entryId: string) => void
  pinPath: (file: string, line: number, path: string) => void
  removePin: (id: string) => void
  focusLine: (file: string, line: number) => void
  seekTimeline: (file: string, line: number, seq: number) => void
  stepTimeline: (file: string, line: number, direction: 'backward' | 'forward') => void
}

export interface TimeTravelState {
  frames: TimelineFrame[]
  currentSeq?: number
}

export class LogViewerProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ghostlog.logViewer'
  private view?: vscode.WebviewView
  private entries: LogEntry[] = []
  private diff?: LogDiff
  private pins: PinnedPath[] = []
  private focusedLine?: { file: string; line: number }
  private timeTravel: TimeTravelState = { frames: [] }

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
      } else if (
        message.type === 'pin' &&
        typeof message.file === 'string' &&
        typeof message.line === 'number' &&
        typeof message.path === 'string'
      ) {
        this.actions.pinPath(message.file, message.line, message.path)
      } else if (message.type === 'removePin' && typeof message.id === 'string') {
        this.actions.removePin(message.id)
      } else if (
        message.type === 'focusLine' &&
        typeof message.file === 'string' &&
        typeof message.line === 'number'
      ) {
        this.actions.focusLine(message.file, message.line)
      } else if (
        message.type === 'timelineSeek' &&
        typeof message.file === 'string' &&
        typeof message.line === 'number' &&
        typeof message.seq === 'number'
      ) {
        this.actions.seekTimeline(message.file, message.line, message.seq)
      } else if (
        message.type === 'timelineStep' &&
        typeof message.file === 'string' &&
        typeof message.line === 'number' &&
        (message.direction === 'backward' || message.direction === 'forward')
      ) {
        this.actions.stepTimeline(message.file, message.line, message.direction)
      }
    })
    this.render()
  }

  update(entries: LogEntry[], diff?: LogDiff, pins: PinnedPath[] = [], timeTravel: TimeTravelState = { frames: [] }): void {
    this.entries = [...entries]
    this.diff = diff
    this.pins = [...pins]
    this.timeTravel = timeTravel
    this.render()
  }

  setFocusedLine(file: string, line: number): void {
    this.focusedLine = { file, line }
    this.render()
  }

  private render(): void {
    if (!this.view) {
      return
    }

    const focus = this.focusedLine ?? this.getLatestLine()
    const focusEntries = focus
      ? this.entries.filter((entry) => entry.file === focus.file && entry.line === focus.line)
      : []
    const focusPatterns = classifyEntries(
      focusEntries.map((entry) => entry.parsedValue).filter((value) => value !== undefined)
    )
    const maxPatternCount = Math.max(...[...focusPatterns.values()].map((pattern) => pattern.count), 1)
    const latestFocusedEntry = focusEntries.at(-1)
    const diffBanner = this.diff
      ? `<div class="diff">Diff mode: +${this.diff.added.length} / -${this.diff.removed.length} / ~${this.diff.changed.length}</div>`
      : ''
    const focusBanner = focus
      ? `<div class="focus">Focused line: ${escapeHtml(
          `${vscode.workspace.asRelativePath(focus.file)}:${focus.line + 1}`
        )}</div>`
      : '<div class="focus">Focused line: none</div>'
    const rows = this.entries
      .map((entry, index) => {
        const id = `${index}:${entry.file ?? ''}:${entry.line ?? -1}:${entry.timestamp}`
        const value = escapeHtml(
          entry.kind === 'network'
            ? entry.network
              ? `${entry.network.method} ${entry.network.status ?? 'ERR'} ${entry.network.duration}ms ${entry.network.url}`
              : entry.raw
            : entry.lens
              ? formatValue(entry.lens.result, 2)
              : entry.values.join(' ') || entry.raw
        )
        const file = entry.file ?? 'unknown'
        const line = entry.line ?? -1
        const signature = escapeHtml(entry.patternSignature ?? '')
        const fileLine = escapeHtml(`${vscode.workspace.asRelativePath(file)}:${line + 1}`)
        const time = escapeHtml(new Date(entry.timestamp).toLocaleTimeString())
        const level = escapeHtml(entry.level.toUpperCase())
        const rowClass = entry.level
        const isFocused = focus ? file === focus.file && line === focus.line : false
        return `<tr class="row ${rowClass} ${isFocused ? 'focused-row' : ''}" data-entry-id="${id}" data-pattern="${signature}" data-file="${escapeHtml(file)}" data-line="${line}">
          <td>${time}</td>
          <td>${fileLine}</td>
          <td>${level}</td>
          <td title="${value}">${value}</td>
          <td class="actions">
            <button type="button" data-focus="${escapeHtml(file)}:${line}">focus</button>
            <button type="button" data-open-entry="${id}">open</button>
          </td>
        </tr>`
      })
      .join('')
    const patternsMarkup = focusPatterns.size
      ? [...focusPatterns.values()]
          .sort((left, right) => right.count - left.count)
          .map((pattern) => {
            const width = `${Math.max(8, Math.round((pattern.count / maxPatternCount) * 100))}%`
            const examples = escapeHtml(pattern.examples.map((example) => formatValue(example, 1)).join(' | '))
            return `<button class="pattern" type="button" data-pattern-filter="${escapeHtml(pattern.signature)}">
              <div class="pattern-head">
                <strong>${escapeHtml(pattern.signature)}</strong>
                <span>${pattern.count}</span>
              </div>
              <div class="histogram"><span style="width:${width}"></span></div>
              <div class="pattern-example" title="${examples}">${examples}</div>
            </button>`
          })
          .join('')
      : '<div class="empty">No pattern data for this line yet.</div>'
    const pinsMarkup = this.pins.length
      ? this.pins
          .map((pin) => {
            const history = pin.history.length
              ? pin.history
                  .map((entry) => {
                    const value = escapeHtml(formatValue(entry.value, 2))
                    const time = escapeHtml(new Date(entry.timestamp).toLocaleTimeString())
                    return `<div class="pin-history-item ${entry.changed ? 'changed' : ''}"><span>${time}</span><span>${value}</span></div>`
                  })
                  .join('')
              : '<div class="empty">(waiting for updates...)</div>'
            return `<div class="pin-card">
              <div class="pin-head">
                <strong>${escapeHtml(pin.path)}</strong>
                <button type="button" data-remove-pin="${escapeHtml(pin.id)}">remove</button>
              </div>
              <div class="pin-meta">${escapeHtml(`${vscode.workspace.asRelativePath(pin.file)}:${pin.line + 1}`)}</div>
              ${history}
            </div>`
          })
          .join('')
      : '<div class="empty">No pinned paths yet.</div>'
    const detailMarkup =
      focus && latestFocusedEntry?.parsedValue !== undefined
        ? this.renderPinnedValueTree(latestFocusedEntry.parsedValue, focus.file, focus.line)
        : '<div class="empty">Select a structured value to browse pin paths.</div>'
    const timelineMarkup = this.renderTimeTravel(focus)

    this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); margin: 0; padding: 12px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
    .banner { display: grid; gap: 6px; margin-bottom: 12px; }
    .focus, .diff { font-size: 12px; opacity: 0.85; }
    .layout { display: grid; gap: 12px; }
    .panel { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 10px; }
    .panel h3 { font-size: 12px; letter-spacing: 0.08em; margin: 0 0 8px; text-transform: uppercase; }
    input { flex: 1; padding: 6px; }
    button { padding: 4px 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
    .row { cursor: default; }
    .row button { margin-right: 6px; }
    .focused-row { background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 18%, transparent); }
    .log td:nth-child(3) { color: #4c8dff; }
    .warn td:nth-child(3) { color: #d2a73b; }
    .error td:nth-child(3) { color: #dc5b5b; }
    .actions { white-space: nowrap; }
    .tabs { display: flex; gap: 8px; margin-bottom: 10px; }
    .tab { opacity: 0.7; }
    .tab.active { opacity: 1; }
    .tab-panel.hidden { display: none; }
    .patterns { display: grid; gap: 8px; }
    .pattern { background: transparent; border: 1px solid var(--vscode-panel-border); border-radius: 8px; display: grid; gap: 6px; padding: 8px; text-align: left; width: 100%; }
    .pattern-head { align-items: center; display: flex; justify-content: space-between; }
    .histogram { background: color-mix(in srgb, var(--vscode-panel-border) 50%, transparent); border-radius: 999px; height: 8px; overflow: hidden; }
    .histogram span { background: var(--vscode-terminal-ansiBlue); display: block; height: 100%; }
    .pattern-example { font-size: 11px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pin-grid { display: grid; gap: 8px; }
    .pin-card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 8px; }
    .pin-head { align-items: center; display: flex; justify-content: space-between; gap: 8px; }
    .pin-meta { font-size: 11px; margin: 6px 0; opacity: 0.75; }
    .pin-history-item { display: grid; gap: 8px; grid-template-columns: auto 1fr; }
    .pin-history-item.changed { color: var(--vscode-terminal-ansiYellow); }
    .tree { display: grid; gap: 4px; }
    .tree-row { align-items: center; display: grid; gap: 8px; grid-template-columns: 1fr auto auto; margin-left: var(--indent, 0px); }
    .tree-path { font-family: var(--vscode-editor-font-family); word-break: break-word; }
    .tree-value { opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timeline-controls { align-items: center; display: grid; gap: 8px; grid-template-columns: auto auto 1fr auto; margin-bottom: 8px; }
    .timeline-meta { display: flex; gap: 10px; font-size: 11px; opacity: 0.8; }
    .timeline-value { border: 1px solid var(--vscode-panel-border); border-radius: 8px; font-family: var(--vscode-editor-font-family); font-size: 12px; overflow: auto; padding: 8px; white-space: pre-wrap; word-break: break-word; }
    .empty { font-size: 12px; opacity: 0.75; }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="filter" type="search" placeholder="Filter logs" />
    <button id="clear">Clear All</button>
    <button id="export">Export</button>
  </div>
  <div class="banner">
    ${focusBanner}
    ${diffBanner}
  </div>
  <div class="layout">
    <div class="panel">
      <h3>Entries</h3>
      <table>
        <thead>
          <tr><th>Time</th><th>File:Line</th><th>Level</th><th>Value</th><th></th></tr>
        </thead>
        <tbody id="rows">${rows}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>Time Travel</h3>
      ${timelineMarkup}
    </div>
    <div class="panel">
      <div class="tabs">
        <button class="tab active" data-tab="patterns" type="button">Patterns</button>
        <button class="tab" data-tab="pins" type="button">Pins</button>
        <button class="tab" data-tab="paths" type="button">Paths</button>
      </div>
      <div class="tab-panel" data-panel="patterns">
        <div class="patterns">${patternsMarkup}</div>
      </div>
      <div class="tab-panel hidden" data-panel="pins">
        <div class="pin-grid">${pinsMarkup}</div>
      </div>
      <div class="tab-panel hidden" data-panel="paths">
        <div class="tree">${detailMarkup}</div>
      </div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const filter = document.getElementById('filter');
    const rows = Array.from(document.querySelectorAll('.row'));
    let patternFilter = '';

    filter.addEventListener('input', applyFilters);
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    document.getElementById('export').addEventListener('click', () => vscode.postMessage({ type: 'export' }));

    for (const button of document.querySelectorAll('[data-open-entry]')) {
      button.addEventListener('click', () => vscode.postMessage({ type: 'open', entryId: button.dataset.openEntry }));
    }
    for (const button of document.querySelectorAll('[data-focus]')) {
      button.addEventListener('click', () => {
        const [file, line] = button.dataset.focus.split(':');
        vscode.postMessage({ type: 'focusLine', file, line: Number(line) });
      });
    }
    for (const button of document.querySelectorAll('[data-pattern-filter]')) {
      button.addEventListener('click', () => {
        patternFilter = patternFilter === button.dataset.patternFilter ? '' : button.dataset.patternFilter;
        applyFilters();
      });
    }
    for (const button of document.querySelectorAll('[data-pin-path]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({
          type: 'pin',
          file: button.dataset.file,
          line: Number(button.dataset.line),
          path: button.dataset.pinPath
        });
      });
    }
    for (const button of document.querySelectorAll('[data-remove-pin]')) {
      button.addEventListener('click', () => vscode.postMessage({ type: 'removePin', id: button.dataset.removePin }));
    }
    for (const slider of document.querySelectorAll('[data-timeline-slider]')) {
      slider.addEventListener('input', () => {
        vscode.postMessage({
          type: 'timelineSeek',
          file: slider.dataset.file,
          line: Number(slider.dataset.line),
          seq: Number(slider.value)
        });
      });
    }
    for (const button of document.querySelectorAll('[data-timeline-step]')) {
      button.addEventListener('click', () => {
        vscode.postMessage({
          type: 'timelineStep',
          file: button.dataset.file,
          line: Number(button.dataset.line),
          direction: button.dataset.timelineStep
        });
      });
    }
    for (const tab of document.querySelectorAll('[data-tab]')) {
      tab.addEventListener('click', () => {
        for (const current of document.querySelectorAll('[data-tab]')) {
          current.classList.toggle('active', current === tab);
        }
        for (const panel of document.querySelectorAll('[data-panel]')) {
          panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.tab);
        }
      });
    }

    applyFilters();

    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const timeline = document.querySelector('[data-timeline-slider]');
      if (!timeline) {
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        vscode.postMessage({
          type: 'timelineStep',
          file: timeline.dataset.file,
          line: Number(timeline.dataset.line),
          direction: event.key === 'ArrowLeft' ? 'backward' : 'forward'
        });
        event.preventDefault();
      }
    });

    function applyFilters() {
      const query = filter.value.toLowerCase();
      for (const row of rows) {
        const matchesText = row.textContent.toLowerCase().includes(query);
        const matchesPattern = !patternFilter || row.dataset.pattern === patternFilter;
        row.style.display = matchesText && matchesPattern ? '' : 'none';
      }
    }
  </script>
</body>
</html>`
  }

  private getLatestLine(): { file: string; line: number } | undefined {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index]
      if (entry.file && typeof entry.line === 'number') {
        return { file: entry.file, line: entry.line }
      }
    }
    return undefined
  }

  private renderPinnedValueTree(value: unknown, file: string, line: number, path = '', depth = 0): string {
    const rows: string[] = []
    const preview = escapeHtml(formatValue(value, 1))
    if (path) {
      rows.push(
        `<div class="tree-row" style="--indent:${depth * 14}px">
          <span class="tree-path">${escapeHtml(path)}</span>
          <span class="tree-value">${preview}</span>
          <button type="button" data-pin-path="${escapeHtml(path)}" data-file="${escapeHtml(file)}" data-line="${line}">pin</button>
        </div>`
      )
    }

    if (Array.isArray(value)) {
      value.slice(0, 8).forEach((entry, index) => {
        const nextPath = path ? `${path}[${index}]` : `[${index}]`
        rows.push(this.renderPinnedValueTree(entry, file, line, nextPath, depth + 1))
      })
      return rows.join('')
    }

    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>)
        .slice(0, 12)
        .forEach(([key, entry]) => {
          const nextPath = path ? `${path}.${key}` : key
          rows.push(this.renderPinnedValueTree(entry, file, line, nextPath, depth + 1))
        })
    }

    return rows.join('')
  }

  private renderTimeTravel(focus?: { file: string; line: number }): string {
    if (!focus || this.timeTravel.frames.length === 0) {
      return '<div class="empty">Focus a line with captured values to scrub its history.</div>'
    }
    const first = this.timeTravel.frames[0]
    const last = this.timeTravel.frames.at(-1)!
    const current =
      this.timeTravel.frames.find((frame) => frame.seq === this.timeTravel.currentSeq) ??
      last
    const deltaLabel = current.deltaKeys.length > 0 ? current.deltaKeys.join(', ') : '(no change)'
    return `<div class="timeline-controls">
      <button type="button" data-timeline-step="backward" data-file="${escapeHtml(focus.file)}" data-line="${focus.line}">Prev</button>
      <button type="button" data-timeline-step="forward" data-file="${escapeHtml(focus.file)}" data-line="${focus.line}">Next</button>
      <input type="range" min="${first.seq}" max="${last.seq}" value="${current.seq}" data-timeline-slider="true" data-file="${escapeHtml(focus.file)}" data-line="${focus.line}" />
      <span>#${current.seq}</span>
    </div>
    <div class="timeline-meta">
      <span>${escapeHtml(new Date(current.timestamp).toLocaleTimeString())}</span>
      <span>Δ ${escapeHtml(deltaLabel)}</span>
      <span>${escapeHtml(`${this.timeTravel.frames.length} frames`)}</span>
    </div>
    <div class="timeline-value">${escapeHtml(formatValue(current.value, 2))}</div>`
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
