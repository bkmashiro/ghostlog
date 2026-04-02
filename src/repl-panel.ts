import * as vscode from 'vscode'
import type { PinnedPath } from './pin.js'
import { GhostlogRepl, formatValue } from './repl.js'

export interface ReplPanelActions {
  removePin: (id: string) => void
}

export class ReplPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ghostlog.repl'
  private readonly repl = new GhostlogRepl()
  private view?: vscode.WebviewView
  private pins: PinnedPath[] = []

  constructor(private readonly actions: ReplPanelActions) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this.getHtml(webviewView.webview)

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'evaluate' && typeof message.expression === 'string') {
        this.repl.evaluate(message.expression)
        void this.postState()
      } else if (message.type === 'clear') {
        this.repl.clearHistory()
        void this.postState()
      } else if (message.type === 'removePin' && typeof message.id === 'string') {
        this.actions.removePin(message.id)
      }
    })

    void this.postState()
  }

  updateValues(values: Map<string, unknown>): void {
    this.repl.updateContext(values)
    void this.postState()
  }

  updateCapturedValues(values: Array<{ key: string; raw: string }>): void {
    this.repl.updateFromCaptured(values)
    void this.postState()
  }

  updatePins(pins: PinnedPath[]): void {
    this.pins = pins
    void this.postState()
  }

  private async postState(): Promise<void> {
    if (!this.view) {
      return
    }
    const context = this.repl.getContext()
    await this.view.webview.postMessage({
      type: 'state',
      summary: this.buildContextSummary(context),
      variables: this.buildVariableList(context),
      history: this.repl.getHistory(),
      pins: this.pins.map((pin) => ({
        id: pin.id,
        file: pin.file,
        line: pin.line,
        path: pin.path,
        history: pin.history.map((entry) => ({
          ...entry,
          time: new Date(entry.timestamp).toLocaleTimeString(),
          value: formatValue(entry.value, 2)
        }))
      }))
    })
  }

  private buildContextSummary(context: Record<string, unknown>): string {
    const names = Object.keys(context).filter((key) => key === '$last' || /^\$\d+$/.test(key))
    if (names.length === 0) {
      return 'No values captured yet'
    }
    return names
      .slice(0, 6)
      .map((name) => `${name} = ${formatValue(context[name], 2)}`)
      .join('\n')
  }

  private buildVariableList(context: Record<string, unknown>): string[] {
    return Object.keys(context)
      .filter((key) => key.startsWith('$'))
      .sort((left, right) => {
        if (left === '$last') {
          return 1
        }
        if (right === '$last') {
          return -1
        }
        return left.localeCompare(right, undefined, { numeric: true })
      })
  }

  private getHtml(_webview: vscode.Webview): string {
    const nonce = String(Date.now())
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light dark; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      margin: 0;
      padding: 8px;
    }
    .section {
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 8px;
      padding-bottom: 8px;
    }
    .section-title {
      font-size: 11px;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
      opacity: 0.75;
      text-transform: uppercase;
    }
    .context {
      white-space: pre-wrap;
      opacity: 0.85;
    }
    .context-vars {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin-top: 6px;
      word-break: break-word;
    }
    .pins, .history {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pin, .entry {
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent);
      border-radius: 6px;
      padding: 8px;
    }
    .pin-head {
      align-items: center;
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .pin-path {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .pin-location {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin-bottom: 6px;
    }
    .pin-history {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pin-item {
      display: grid;
      gap: 8px;
      grid-template-columns: auto 1fr auto;
    }
    .pin-item.changed {
      color: var(--vscode-terminal-ansiYellow);
    }
    .prompt {
      color: var(--vscode-terminal-ansiGreen);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .result {
      color: var(--vscode-terminal-ansiBrightBlue);
      margin-left: 16px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .error {
      color: var(--vscode-terminal-ansiRed);
      margin-left: 16px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .input-row {
      align-items: center;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      position: sticky;
      bottom: 0;
      background: var(--vscode-editor-background);
    }
    .input-prompt {
      color: var(--vscode-terminal-ansiGreen);
      flex: none;
    }
    input {
      background: transparent;
      border: none;
      color: inherit;
      flex: 1;
      font: inherit;
      outline: none;
      min-width: 0;
    }
    button {
      background: transparent;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font: inherit;
      opacity: 0.8;
      padding: 2px 6px;
    }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">Context</div>
    <div class="context" id="context">No values captured yet</div>
    <div class="context-vars" id="vars"></div>
  </div>
  <div class="section">
    <div class="section-title">Pinned Paths</div>
    <div class="pins" id="pins"></div>
  </div>
  <div class="section">
    <div class="section-title">REPL History</div>
    <div class="history" id="history"></div>
  </div>
  <div class="input-row">
    <span class="input-prompt">&gt;</span>
    <input type="text" id="input" placeholder="$0?.value, $last, JSON.stringify($1)" autofocus />
    <button id="clear" type="button">clear</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('input');
    const historyEl = document.getElementById('history');
    const contextEl = document.getElementById('context');
    const varsEl = document.getElementById('vars');
    const pinsEl = document.getElementById('pins');
    const commandHistory = [];
    let historyIndex = -1;

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input.value.trim()) {
        const expression = input.value.trim();
        commandHistory.unshift(expression);
        historyIndex = -1;
        input.value = '';
        vscode.postMessage({ type: 'evaluate', expression });
      } else if (event.key === 'ArrowUp') {
        historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        input.value = commandHistory[historyIndex] || '';
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        historyIndex = Math.max(historyIndex - 1, -1);
        input.value = historyIndex >= 0 ? commandHistory[historyIndex] : '';
        event.preventDefault();
      }
    });

    document.getElementById('clear').addEventListener('click', () => {
      vscode.postMessage({ type: 'clear' });
    });

    window.addEventListener('message', ({ data }) => {
      if (data.type === 'state') {
        contextEl.textContent = data.summary;
        varsEl.textContent = data.variables.length ? 'Available: ' + data.variables.join(', ') : '';
        renderPins(data.pins);
        renderHistory(data.history);
      }
    });

    function renderPins(pins) {
      pinsEl.innerHTML = '';
      if (!pins.length) {
        pinsEl.innerHTML = '<div class="pin">(waiting for pinned paths)</div>';
        return;
      }

      for (const pin of pins) {
        const div = document.createElement('div');
        div.className = 'pin';
        div.innerHTML =
          '<div class="pin-head">' +
            '<div class="pin-path">' + escapeHtml(pin.path) + '</div>' +
            '<button type="button" data-remove-pin="' + escapeHtml(pin.id) + '">remove</button>' +
          '</div>' +
          '<div class="pin-location">' + escapeHtml(pin.file + ':' + (pin.line + 1)) + '</div>' +
          '<div class="pin-history">' +
            (pin.history.length
              ? pin.history.map((entry) =>
                  '<div class="pin-item ' + (entry.changed ? 'changed' : '') + '">' +
                    '<span>' + escapeHtml(entry.time) + '</span>' +
                    '<span>' + escapeHtml(entry.value) + '</span>' +
                    '<span>' + (entry.changed ? 'changed' : '') + '</span>' +
                  '</div>'
                ).join('')
              : '<div>(waiting for updates...)</div>') +
          '</div>';
        pinsEl.appendChild(div);
      }

      for (const button of pinsEl.querySelectorAll('[data-remove-pin]')) {
        button.addEventListener('click', () => {
          vscode.postMessage({ type: 'removePin', id: button.dataset.removePin });
        });
      }
    }

    function renderHistory(results) {
      historyEl.innerHTML = '';
      for (const result of results) {
        const div = document.createElement('div');
        div.className = 'entry';
        div.innerHTML = '<div class="prompt">&gt; ' + escapeHtml(result.input) + '</div>' +
          (result.error
            ? '<div class="error">✗ ' + escapeHtml(result.error) + '</div>'
            : '<div class="result">← ' + escapeHtml(result.output) + '</div>');
        historyEl.appendChild(div);
      }
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }
  </script>
</body>
</html>`
  }
}
