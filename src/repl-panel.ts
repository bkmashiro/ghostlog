import * as vscode from 'vscode'
import { GhostlogRepl, formatValue } from './repl.js'

export class ReplPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ghostlog.repl'
  private readonly repl = new GhostlogRepl()
  private view?: vscode.WebviewView

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

  private async postState(): Promise<void> {
    if (!this.view) {
      return
    }
    const context = this.repl.getContext()
    await this.view.webview.postMessage({
      type: 'state',
      summary: this.buildContextSummary(context),
      variables: this.buildVariableList(context),
      history: this.repl.getHistory()
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
    .context {
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 8px;
      padding-bottom: 8px;
      white-space: pre-wrap;
      opacity: 0.85;
    }
    .context-vars {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      margin-top: 6px;
      word-break: break-word;
    }
    .history {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: calc(100vh - 140px);
      overflow-y: auto;
    }
    .entry {
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent);
      padding-bottom: 8px;
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
  <div class="context" id="context">No values captured yet</div>
  <div class="context-vars" id="vars">$0, $1, $last</div>
  <div class="history" id="history"></div>
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
        renderHistory(data.history);
      }
    });

    function renderHistory(results) {
      historyEl.innerHTML = '';
      for (const result of results) {
        appendResult(result);
      }
    }

    function appendResult(result) {
      const div = document.createElement('div');
      div.className = 'entry';
      div.innerHTML = '<div class="prompt">&gt; ' + escapeHtml(result.input) + '</div>' +
        (result.error
          ? '<div class="error">✗ ' + escapeHtml(result.error) + '</div>'
          : '<div class="result">← ' + escapeHtml(result.output) + '</div>');
      historyEl.appendChild(div);
      historyEl.scrollTop = historyEl.scrollHeight;
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
