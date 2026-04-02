"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var import_node_path2 = __toESM(require("node:path"));
var vscode4 = __toESM(require("vscode"));

// src/commands.ts
var vscode = __toESM(require("vscode"));
function registerCommands(handlers) {
  return [
    vscode.commands.registerCommand("ghostlog.clear", handlers.clearAll),
    vscode.commands.registerCommand("ghostlog.toggle", handlers.toggle),
    vscode.commands.registerCommand("ghostlog.clearFile", handlers.clearFile),
    vscode.commands.registerCommand("ghostlog.addLogpoint", handlers.addLogpoint),
    vscode.commands.registerCommand("ghostlog.snapshotLogs", handlers.snapshotLogs),
    vscode.commands.registerCommand("ghostlog.diffLogs", handlers.diffLogs),
    vscode.commands.registerCommand("ghostlog.startMcp", handlers.startMcp),
    vscode.commands.registerCommand("ghostlog.stopMcp", handlers.stopMcp),
    vscode.commands.registerCommand("ghostlog.focusLogViewer", handlers.focusLogViewer)
  ];
}

// src/parser.ts
var GHOSTLOG_PREFIX = "__GHOSTLOG__";
function splitTopLevelValues(input) {
  const values = [];
  let current = "";
  let quote = null;
  let escape = false;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) {
      values.push(trimmed);
    }
    current = "";
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      current += char;
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") {
      depthParen += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      depthParen = Math.max(0, depthParen - 1);
      current += char;
      continue;
    }
    if (char === "{") {
      depthBrace += 1;
      current += char;
      continue;
    }
    if (char === "}") {
      depthBrace = Math.max(0, depthBrace - 1);
      current += char;
      continue;
    }
    if (char === "[") {
      depthBracket += 1;
      current += char;
      continue;
    }
    if (char === "]") {
      depthBracket = Math.max(0, depthBracket - 1);
      current += char;
      continue;
    }
    const isTopLevel = depthParen === 0 && depthBrace === 0 && depthBracket === 0 && !quote;
    if (isTopLevel && /\s/.test(char)) {
      const next = input[index + 1] ?? "";
      if (current.trim() && next && !/\s/.test(next)) {
        pushCurrent();
      }
      continue;
    }
    current += char;
  }
  pushCurrent();
  return values;
}
function extractLabel(line) {
  let quote = null;
  let escape = false;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depthParen += 1;
      continue;
    }
    if (char === ")") {
      depthParen = Math.max(0, depthParen - 1);
      continue;
    }
    if (char === "{") {
      depthBrace += 1;
      continue;
    }
    if (char === "}") {
      depthBrace = Math.max(0, depthBrace - 1);
      continue;
    }
    if (char === "[") {
      depthBracket += 1;
      continue;
    }
    if (char === "]") {
      depthBracket = Math.max(0, depthBracket - 1);
      continue;
    }
    const isTopLevel = depthParen === 0 && depthBrace === 0 && depthBracket === 0 && !quote;
    if (isTopLevel && char === ":") {
      const candidate = line.slice(0, index + 1).trim();
      if (candidate && !candidate.includes(" ")) {
        return {
          label: candidate,
          rest: line.slice(index + 1).trim()
        };
      }
    }
    if (isTopLevel && /\s/.test(char)) {
      break;
    }
  }
  return { rest: line.trim() };
}
function parseLogLine(line, level) {
  const raw = line.trim();
  const looksLikeRuntimeError = /^([A-Z][A-Za-z0-9]*Error|Error):/.test(raw);
  const { label, rest } = extractLabel(raw);
  const values = level === "error" && (!label || looksLikeRuntimeError) ? raw ? [raw] : [] : splitTopLevelValues(rest);
  return {
    raw,
    level,
    values,
    label,
    timestamp: Date.now()
  };
}
function parseStructuredPayload(line) {
  const raw = line.trim();
  if (!raw.startsWith(GHOSTLOG_PREFIX)) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(GHOSTLOG_PREFIX.length));
  } catch {
    return null;
  }
}
function truncateValue(value, maxLen = 60) {
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}
function formatValues(values) {
  return values.join("  ");
}
function groupEntries(entries, maxShow = 5) {
  const flattened = entries.flatMap((entry) => entry.values);
  if (flattened.length === 0) {
    return "";
  }
  const visible = flattened.slice(0, maxShow);
  const base = formatValues(visible);
  const remaining = flattened.length - visible.length;
  if (remaining <= 0) {
    return base;
  }
  return `${base}  ... (+${remaining} more)`;
}
function formatNetworkEntry(entry) {
  if (entry.error) {
    return `\u{1F310} ${entry.method} \u2717 ${entry.error}`;
  }
  return `\u{1F310} ${entry.method} ${entry.status ?? "ERR"} ${entry.duration}ms`;
}

// src/perf.ts
function classifyDuration(ms) {
  if (ms < 10) {
    return "fast";
  }
  if (ms < 100) {
    return "medium";
  }
  return "slow";
}

// src/decorator.ts
function buildDecorationText(entries) {
  if (entries.length === 0) {
    return "";
  }
  if (entries.every((entry) => entry.kind === "network" && entry.network)) {
    return entries.map((entry) => formatNetworkEntry(entry.network)).join("  ");
  }
  if (entries.every((entry) => entry.kind === "timing" && entry.timing?.duration !== void 0)) {
    return entries.map((entry) => {
      const duration = entry.timing?.duration ?? 0;
      const prefix2 = classifyDuration(duration) === "slow" ? "\u23F1" : classifyDuration(duration) === "medium" ? "\u23F1" : "\u23F1";
      return `${prefix2} ${duration}ms`;
    }).join("  ");
  }
  if (entries.every((entry) => entry.kind === "logpoint")) {
    return entries.map((entry) => `\u{1F4CD} ${entry.expression ?? "expr"} = ${entry.values.join(" ") || entry.raw}`).join("  ");
  }
  const highestLevel = entries.find((entry) => entry.level === "error")?.level ?? entries.find((entry) => entry.level === "warn")?.level ?? entries[0].level;
  const prefix = highestLevel === "error" ? "\u26A0" : highestLevel === "warn" ? "\u{1F47B} !" : "\u{1F47B}";
  const text = groupEntries(entries);
  return text ? `${prefix} ${text}` : prefix;
}
function getDecorationOptions(level) {
  const colorByLevel = {
    log: "rgba(120, 120, 120, 0.95)",
    info: "rgba(80, 120, 180, 0.95)",
    warn: "rgba(180, 120, 40, 0.95)",
    error: "rgba(196, 68, 68, 0.98)"
  };
  return {
    after: {
      color: colorByLevel[level],
      margin: "0 0 0 1.5rem",
      fontStyle: "italic"
    },
    rangeBehavior: 1
  };
}

// src/diff.ts
function createFingerprint(entry) {
  return JSON.stringify({
    file: entry.file ?? "",
    line: entry.line ?? -1,
    kind: entry.kind ?? "log",
    raw: entry.raw,
    level: entry.level,
    values: entry.values
  });
}
function createLineKey(entry) {
  return `${entry.file ?? ""}:${entry.line ?? -1}:${entry.kind ?? "log"}`;
}
var LogDiffManager = class {
  snapshots = [];
  saveSnapshot(entries, name) {
    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      timestamp: Date.now(),
      entries: entries.map((entry) => ({ ...entry }))
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }
  listSnapshots() {
    return [...this.snapshots];
  }
  getLastSnapshot() {
    return this.snapshots.at(-1);
  }
  diff(snap1, snap2) {
    const snap1Fingerprints = /* @__PURE__ */ new Map();
    const snap2Fingerprints = /* @__PURE__ */ new Map();
    const snap1ByLine = /* @__PURE__ */ new Map();
    const snap2ByLine = /* @__PURE__ */ new Map();
    for (const entry of snap1.entries) {
      snap1Fingerprints.set(createFingerprint(entry), entry);
      snap1ByLine.set(createLineKey(entry), entry);
    }
    for (const entry of snap2.entries) {
      snap2Fingerprints.set(createFingerprint(entry), entry);
      snap2ByLine.set(createLineKey(entry), entry);
    }
    const added = snap2.entries.filter((entry) => !snap1Fingerprints.has(createFingerprint(entry)));
    const removed = snap1.entries.filter((entry) => !snap2Fingerprints.has(createFingerprint(entry)));
    const changed = [];
    for (const [lineKey, before] of snap1ByLine.entries()) {
      const after = snap2ByLine.get(lineKey);
      if (!after) {
        continue;
      }
      if (createFingerprint(before) !== createFingerprint(after)) {
        changed.push({ before, after });
      }
    }
    return { added, removed, changed };
  }
};

// src/hover.ts
var vscode2 = __toESM(require("vscode"));
var LogHoverProvider = class {
  constructor(source) {
    this.source = source;
  }
  provideHover(document, position) {
    const entries = this.source.getEntries(document.uri.fsPath, position.line);
    if (entries.length === 0) {
      return null;
    }
    const lastEntry = entries.at(-1);
    const content = new vscode2.MarkdownString(void 0, true);
    content.isTrusted = true;
    content.appendMarkdown(`**GhostLog**

`);
    content.appendCodeblock(
      entries.map(
        (entry) => entry.values.length > 0 ? entry.values.join("\n") : entry.raw
      ).join("\n\n"),
      "text"
    );
    content.appendMarkdown(`

Last capture: ${new Date(lastEntry.timestamp).toLocaleString()}`);
    content.appendMarkdown(
      `

[Click to open Log Viewer](command:ghostlog.focusLogViewer)`
    );
    return new vscode2.Hover(content);
  }
};

// src/injector.ts
function generateInjectionScript() {
  return `
(function () {
  const __ghostlog_prefix = '__GHOSTLOG__';
  const __ghostlog_send = (payload) => {
    try {
      console.log(__ghostlog_prefix + JSON.stringify(payload));
    } catch {}
  };

  if (typeof globalThis.fetch === 'function' && !globalThis.__ghostlog_original_fetch) {
    globalThis.__ghostlog_original_fetch = globalThis.fetch;
    globalThis.fetch = async function (...args) {
      const req = {
        type: 'network',
        transport: 'fetch',
        url: String(args[0]),
        method: String(args[1]?.method || 'GET').toUpperCase(),
        time: Date.now()
      };
      try {
        const res = await globalThis.__ghostlog_original_fetch.apply(this, args);
        __ghostlog_send({ ...req, status: res.status, duration: Date.now() - req.time, timestamp: Date.now() });
        return res;
      } catch (error) {
        __ghostlog_send({ ...req, error: String(error), duration: Date.now() - req.time, timestamp: Date.now() });
        throw error;
      }
    };
  }

  if (typeof globalThis.XMLHttpRequest === 'function' && !globalThis.__ghostlog_original_xhr_open) {
    const OriginalXHR = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = function GhostLogXHR() {
      const xhr = new OriginalXHR();
      let method = 'GET';
      let url = '';
      let startedAt = 0;
      const open = xhr.open;
      xhr.open = function (...args) {
        method = String(args[0] || 'GET').toUpperCase();
        url = String(args[1] || '');
        return open.apply(this, args);
      };
      const send = xhr.send;
      xhr.send = function (...args) {
        startedAt = Date.now();
        xhr.addEventListener('loadend', function () {
          __ghostlog_send({
            type: 'network',
            transport: 'xhr',
            method,
            url,
            status: xhr.status,
            duration: Date.now() - startedAt,
            timestamp: Date.now()
          });
        }, { once: true });
        return send.apply(this, args);
      };
      return xhr;
    };
  }

  if (typeof console.time === 'function' && typeof console.timeEnd === 'function' && !console.__ghostlog_original_time) {
    const timeMap = new Map();
    console.__ghostlog_original_time = console.time.bind(console);
    console.__ghostlog_original_timeEnd = console.timeEnd.bind(console);
    console.time = function (label = 'default') {
      timeMap.set(String(label), Date.now());
      __ghostlog_send({ type: 'timing', phase: 'start', label: String(label), timestamp: Date.now() });
      return console.__ghostlog_original_time(label);
    };
    console.timeEnd = function (label = 'default') {
      const key = String(label);
      const startTime = timeMap.get(key);
      const endTime = Date.now();
      __ghostlog_send({
        type: 'timing',
        phase: 'end',
        label: key,
        startTime,
        endTime,
        duration: typeof startTime === 'number' ? endTime - startTime : undefined,
        timestamp: endTime
      });
      timeMap.delete(key);
      return console.__ghostlog_original_timeEnd(label);
    };
  }
})();
`.trim();
}

// src/log-viewer.ts
var vscode3 = __toESM(require("vscode"));
var LogViewerProvider = class {
  constructor(context, actions) {
    this.context = context;
    this.actions = actions;
  }
  static viewType = "ghostlog.logViewer";
  view;
  entries = [];
  diff;
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((message) => {
      if (message.type === "clear") {
        this.actions.clearAll();
      } else if (message.type === "export") {
        void this.actions.exportAll();
      } else if (message.type === "open" && typeof message.entryId === "string") {
        this.actions.openEntry(message.entryId);
      }
    });
    this.render();
  }
  update(entries, diff) {
    this.entries = [...entries];
    this.diff = diff;
    this.render();
  }
  render() {
    if (!this.view) {
      return;
    }
    const rows = this.entries.map((entry, index) => {
      const id = `${index}:${entry.file ?? ""}:${entry.line ?? -1}:${entry.timestamp}`;
      const value = escapeHtml(
        entry.kind === "network" ? entry.network ? `${entry.network.method} ${entry.network.status ?? "ERR"} ${entry.network.duration}ms ${entry.network.url}` : entry.raw : entry.values.join(" ") || entry.raw
      );
      const fileLine = escapeHtml(
        `${entry.file ? vscode3.workspace.asRelativePath(entry.file) : "unknown"}:${(entry.line ?? 0) + 1}`
      );
      const time = escapeHtml(new Date(entry.timestamp).toLocaleTimeString());
      const level = escapeHtml(entry.level.toUpperCase());
      const rowClass = entry.level;
      return `<tr class="row ${rowClass}" data-entry-id="${id}">
          <td>${time}</td>
          <td>${fileLine}</td>
          <td>${level}</td>
          <td title="${value}">${value}</td>
        </tr>`;
    }).join("");
    const diffBanner = this.diff ? `<div class="diff">Diff mode: +${this.diff.added.length} / -${this.diff.removed.length} / ~${this.diff.changed.length}</div>` : "";
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
</html>`;
  }
};
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// src/logpoint.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var LogpointManager = class {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.ensureStorage();
    this.logpoints = this.read();
  }
  logpoints = [];
  add(file, line, expression) {
    const logpoint = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      line,
      expression,
      enabled: true
    };
    this.logpoints.push(logpoint);
    this.write();
    return logpoint;
  }
  remove(id) {
    this.logpoints = this.logpoints.filter((logpoint) => logpoint.id !== id);
    this.write();
  }
  list() {
    return [...this.logpoints];
  }
  getForFile(file) {
    return this.logpoints.filter((logpoint) => logpoint.file === file);
  }
  ensureStorage() {
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(this.storagePath), { recursive: true });
    if (!import_node_fs.default.existsSync(this.storagePath)) {
      import_node_fs.default.writeFileSync(this.storagePath, "[]", "utf8");
    }
  }
  read() {
    try {
      const content = import_node_fs.default.readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  write() {
    import_node_fs.default.writeFileSync(this.storagePath, JSON.stringify(this.logpoints, null, 2), "utf8");
  }
};

// src/mcp-server.ts
var import_node_http = __toESM(require("node:http"));
function startMcpServer(port, dataSource) {
  const server = import_node_http.default.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const message = JSON.parse(body);
        const result = handleMethod(message.method, message.params, dataSource);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id ?? null, result }));
      } catch (error) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: String(error) }
          })
        );
      }
    });
  });
  server.listen(port, "127.0.0.1");
  return {
    stop: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    })
  };
}
function handleMethod(method, params, dataSource) {
  switch (method) {
    case "get_recent_logs":
      return dataSource.getRecentLogs();
    case "get_errors":
      return dataSource.getErrors();
    case "get_network_requests":
      return dataSource.getNetworkRequests();
    case "search_logs":
      return dataSource.searchLogs(params?.query ?? "");
    default:
      throw new Error(`Unsupported method: ${method ?? "unknown"}`);
  }
}

// src/repl.ts
var vm = __toESM(require("node:vm"));
function reviveCapturedValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "undefined") {
    return void 0;
  }
  if (trimmed === "null") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    return Number(trimmed);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
  }
  try {
    return vm.runInNewContext(`(${trimmed})`, /* @__PURE__ */ Object.create(null), { timeout: 50 });
  } catch {
    return trimmed;
  }
}
var GhostlogRepl = class {
  context = { $last: void 0 };
  history = [];
  updateContext(entries) {
    const nextContext = { $last: void 0 };
    let index = 0;
    for (const [key, value] of entries) {
      nextContext[`$${index}`] = value;
      nextContext[key] = value;
      nextContext.$last = value;
      index += 1;
    }
    this.context = nextContext;
  }
  updateFromCaptured(values) {
    const entries = /* @__PURE__ */ new Map();
    for (const value of values) {
      entries.set(value.key, reviveCapturedValue(value.raw));
    }
    this.updateContext(entries);
  }
  evaluate(expression) {
    try {
      const sandbox = {
        ...this.context,
        JSON,
        Math,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        RegExp
      };
      const result = vm.runInNewContext(expression, sandbox, { timeout: 1e3 });
      const entry = {
        input: expression,
        output: formatValue(result),
        timestamp: Date.now()
      };
      this.history.push(entry);
      return entry;
    } catch (error) {
      const entry = {
        input: expression,
        output: "",
        error: String(error),
        timestamp: Date.now()
      };
      this.history.push(entry);
      return entry;
    }
  }
  getHistory() {
    return [...this.history];
  }
  clearHistory() {
    this.history = [];
  }
  getContext() {
    return { ...this.context };
  }
};
function formatValue(value, maxDepth = 3) {
  if (value === void 0) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    if (maxDepth <= 0) {
      return `[ ...${value.length} items ]`;
    }
    if (value.length > 10) {
      return `[ ...${value.length} items ]`;
    }
    const preview = value.slice(0, 5).map((entry) => formatValue(entry, maxDepth - 1)).join(", ");
    return `[ ${preview}${value.length > 5 ? ", ..." : ""} ]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return "{}";
    }
    if (maxDepth <= 0) {
      return `{ ...${keys.length} keys }`;
    }
    const preview = keys.slice(0, 4).map((key) => `${key}: ${formatValue(value[key], maxDepth - 1)}`).join(", ");
    return `{ ${preview}${keys.length > 4 ? ", ..." : ""} }`;
  }
  return String(value);
}

// src/repl-panel.ts
var ReplPanelProvider = class {
  static viewType = "ghostlog.repl";
  repl = new GhostlogRepl();
  view;
  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === "evaluate" && typeof message.expression === "string") {
        this.repl.evaluate(message.expression);
        void this.postState();
      } else if (message.type === "clear") {
        this.repl.clearHistory();
        void this.postState();
      }
    });
    void this.postState();
  }
  updateValues(values) {
    this.repl.updateContext(values);
    void this.postState();
  }
  updateCapturedValues(values) {
    this.repl.updateFromCaptured(values);
    void this.postState();
  }
  async postState() {
    if (!this.view) {
      return;
    }
    const context = this.repl.getContext();
    await this.view.webview.postMessage({
      type: "state",
      summary: this.buildContextSummary(context),
      variables: this.buildVariableList(context),
      history: this.repl.getHistory()
    });
  }
  buildContextSummary(context) {
    const names = Object.keys(context).filter((key) => key === "$last" || /^\$\d+$/.test(key));
    if (names.length === 0) {
      return "No values captured yet";
    }
    return names.slice(0, 6).map((name) => `${name} = ${formatValue(context[name], 2)}`).join("\n");
  }
  buildVariableList(context) {
    return Object.keys(context).filter((key) => key.startsWith("$")).sort((left, right) => {
      if (left === "$last") {
        return 1;
      }
      if (right === "$last") {
        return -1;
      }
      return left.localeCompare(right, void 0, { numeric: true });
    });
  }
  getHtml(_webview) {
    const nonce = String(Date.now());
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
          ? '<div class="error">\u2717 ' + escapeHtml(result.error) + '</div>'
          : '<div class="result">\u2190 ' + escapeHtml(result.output) + '</div>');
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
</html>`;
  }
};

// src/tracker.ts
var CONSOLE_METHODS = ["log", "warn", "error", "info", "time", "timeEnd"];
var NETWORK_PATTERNS = [/fetch\s*\(/g, /axios(?:\.[a-zA-Z]+)?\s*\(/g];
function indexToLineColumn(content, index) {
  let line = 0;
  let column = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content[cursor] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}
function scanCallEnd(content, openParenIndex) {
  let quote = null;
  let escape = false;
  let depth = 0;
  for (let index = openParenIndex; index < content.length; index += 1) {
    const char = content[index];
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}
function extractFirstStringLiteral(callText) {
  const match = callText.match(/console\.(?:log|warn|error|info|time|timeEnd)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/s);
  if (!match) {
    return null;
  }
  return match[2];
}
function labelSimilarity(label, callText) {
  const literal = extractFirstStringLiteral(callText);
  if (!literal) {
    return 0;
  }
  if (literal === label) {
    return 100;
  }
  if (literal.startsWith(label)) {
    return 80;
  }
  if (literal.includes(label)) {
    return 50;
  }
  return 0;
}
function findLogLocations(fileContent, filePath) {
  const locations = [];
  for (const method of CONSOLE_METHODS) {
    const pattern = new RegExp(`console\\.${method}\\s*\\(`, "g");
    for (const match of fileContent.matchAll(pattern)) {
      const start = match.index ?? -1;
      if (start < 0) {
        continue;
      }
      const openParenIndex = fileContent.indexOf("(", start);
      const end = scanCallEnd(fileContent, openParenIndex);
      if (end < 0) {
        continue;
      }
      const { line, column } = indexToLineColumn(fileContent, start);
      locations.push({
        file: filePath,
        line,
        column,
        callText: fileContent.slice(start, end + 1),
        kind: "console"
      });
    }
  }
  return locations.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.column - right.column;
  });
}
function findNetworkLocations(fileContent, filePath) {
  const locations = [];
  for (const pattern of NETWORK_PATTERNS) {
    for (const match of fileContent.matchAll(pattern)) {
      const start = match.index ?? -1;
      if (start < 0) {
        continue;
      }
      const openParenIndex = fileContent.indexOf("(", start);
      const end = scanCallEnd(fileContent, openParenIndex);
      if (end < 0) {
        continue;
      }
      const { line, column } = indexToLineColumn(fileContent, start);
      locations.push({
        file: filePath,
        line,
        column,
        callText: fileContent.slice(start, end + 1),
        kind: "network"
      });
    }
  }
  return locations.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.column - right.column;
  });
}
function matchOutputToLocation(output, locations) {
  if (locations.length === 0) {
    return null;
  }
  if (output.label) {
    const ranked = locations.map((location) => ({
      location,
      score: labelSimilarity(output.label, location.callText)
    })).filter((entry) => entry.score > 0).sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      if (left.location.line !== right.location.line) {
        return left.location.line - right.location.line;
      }
      return left.location.column - right.location.column;
    });
    return ranked[0]?.location ?? null;
  }
  return locations.length === 1 ? locations[0] : null;
}
function networkSimilarity(url, callText) {
  if (!url) {
    return 0;
  }
  if (callText.includes(url)) {
    return 100;
  }
  const pathname = url.split("?")[0];
  if (pathname && callText.includes(pathname)) {
    return 80;
  }
  return 0;
}
function matchNetworkToLocation(output, locations) {
  if (locations.length === 0) {
    return null;
  }
  const ranked = locations.map((location) => ({
    location,
    score: networkSimilarity(output.url, location.callText)
  })).sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return left.location.line - right.location.line;
  });
  return ranked[0]?.location ?? null;
}

// src/extension.ts
var GhostLogController = class {
  constructor(context) {
    this.context = context;
    this.enabled = this.getConfig("enabled", true);
    this.decorationTypes = {
      log: vscode4.window.createTextEditorDecorationType(getDecorationOptions("log")),
      info: vscode4.window.createTextEditorDecorationType(getDecorationOptions("info")),
      warn: vscode4.window.createTextEditorDecorationType(getDecorationOptions("warn")),
      error: vscode4.window.createTextEditorDecorationType(getDecorationOptions("error"))
    };
    this.logpointManager = new LogpointManager(this.resolveLogpointStoragePath());
    this.logViewer = new LogViewerProvider(context, {
      clearAll: () => this.clearAll(),
      exportAll: () => this.exportAll(),
      openEntry: (entryId) => this.openEntry(entryId)
    });
  }
  decorationTypes;
  indexedConsoleLocations = /* @__PURE__ */ new Map();
  indexedNetworkLocations = /* @__PURE__ */ new Map();
  entriesByFile = /* @__PURE__ */ new Map();
  terminalBuffers = /* @__PURE__ */ new Map();
  entryOrder = [];
  diffManager = new LogDiffManager();
  logViewer;
  logpointManager;
  replPanel = new ReplPanelProvider();
  ghostlogBreakpoints = [];
  currentDiff;
  mcpServer;
  enabled;
  dispose() {
    for (const decorationType of Object.values(this.decorationTypes)) {
      decorationType.dispose();
    }
    if (this.mcpServer) {
      void this.mcpServer.stop();
    }
  }
  register() {
    const disposables = [];
    disposables.push(
      ...registerCommands({
        clearAll: () => this.clearAll(),
        toggle: () => this.toggle(),
        clearFile: () => this.clearFile(vscode4.window.activeTextEditor?.document.uri.fsPath),
        addLogpoint: () => this.addLogpointHere(),
        snapshotLogs: () => this.snapshotLogs(),
        diffLogs: () => this.diffLogs(),
        startMcp: () => this.startMcp(),
        stopMcp: () => this.stopMcp(),
        focusLogViewer: () => vscode4.commands.executeCommand("ghostlog.logViewer.focus")
      })
    );
    disposables.push(
      vscode4.window.registerWebviewViewProvider(LogViewerProvider.viewType, this.logViewer),
      vscode4.window.registerWebviewViewProvider(ReplPanelProvider.viewType, this.replPanel),
      vscode4.languages.registerHoverProvider(
        ["javascript", "javascriptreact", "typescript", "typescriptreact"],
        new LogHoverProvider({
          getEntries: (file, line) => this.getEntriesForLine(file, line)
        })
      ),
      vscode4.workspace.onDidOpenTextDocument((document) => this.indexDocument(document)),
      vscode4.workspace.onDidSaveTextDocument((document) => this.indexDocument(document)),
      vscode4.workspace.onDidChangeTextDocument((event) => {
        this.clearFile(event.document.uri.fsPath);
        this.indexDocument(event.document);
      }),
      vscode4.window.onDidChangeVisibleTextEditors(() => this.renderAllVisibleEditors()),
      vscode4.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("ghostlog")) {
          this.enabled = this.getConfig("enabled", true);
          if (this.getConfig("mcpEnabled", false)) {
            this.startMcp();
          } else {
            this.stopMcp();
          }
          this.renderAllVisibleEditors();
        }
      }),
      vscode4.debug.onDidStartDebugSession((session) => {
        void this.injectDebugRuntime(session);
      })
    );
    if ("onDidWriteTerminalData" in vscode4.window) {
      const terminalEmitter = vscode4.window.onDidWriteTerminalData;
      if (terminalEmitter) {
        disposables.push(
          terminalEmitter((event) => {
            this.captureTerminalOutput(event.terminal, event.data);
          })
        );
      }
    }
    disposables.push(
      vscode4.debug.registerDebugAdapterTrackerFactory("*", {
        createDebugAdapterTracker: () => ({
          onDidSendMessage: (message) => {
            if (message.type === "event" && message.event === "output") {
              this.captureDebugOutput(message.body);
            }
          }
        })
      })
    );
    for (const document of vscode4.workspace.textDocuments) {
      this.indexDocument(document);
    }
    this.syncLogpointsToBreakpoints();
    if (this.getConfig("mcpEnabled", false)) {
      this.startMcp();
    }
    this.refreshViewer();
    return disposables;
  }
  getConfig(key, fallback) {
    return vscode4.workspace.getConfiguration("ghostlog").get(key, fallback);
  }
  isSupportedDocument(document) {
    return ["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(document.languageId);
  }
  resolveLogpointStoragePath() {
    const workspace3 = vscode4.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspace3) {
      return import_node_path2.default.join(workspace3, ".ghostlog", "logpoints.json");
    }
    return import_node_path2.default.join(this.context.globalStorageUri.fsPath, "logpoints.json");
  }
  indexDocument(document) {
    if (!this.isSupportedDocument(document)) {
      return;
    }
    const filePath = document.uri.fsPath;
    const content = document.getText();
    this.indexedConsoleLocations.set(filePath, findLogLocations(content, filePath));
    this.indexedNetworkLocations.set(filePath, findNetworkLocations(content, filePath));
  }
  clearAll() {
    this.entriesByFile.clear();
    this.entryOrder.length = 0;
    this.currentDiff = void 0;
    this.refreshViewer();
    this.syncReplContext();
    this.renderAllVisibleEditors();
  }
  clearFile(filePath) {
    if (!filePath) {
      return;
    }
    this.entriesByFile.delete(filePath);
    for (let index = this.entryOrder.length - 1; index >= 0; index -= 1) {
      if (this.entryOrder[index].file === filePath) {
        this.entryOrder.splice(index, 1);
      }
    }
    this.refreshViewer();
    this.syncReplContext();
    this.renderAllVisibleEditors();
  }
  toggle() {
    this.enabled = !this.enabled;
    void vscode4.workspace.getConfiguration("ghostlog").update("enabled", this.enabled, vscode4.ConfigurationTarget.Global);
    this.renderAllVisibleEditors();
  }
  captureTerminalOutput(terminal, data) {
    const terminalKey = terminal.name;
    const previous = this.terminalBuffers.get(terminalKey) ?? "";
    const combined = previous + data;
    const lines = combined.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    this.terminalBuffers.set(terminalKey, remainder);
    for (const line of lines) {
      this.processOutputLine(line, "log");
    }
  }
  captureDebugOutput(body) {
    const rawOutput = typeof body.output === "string" ? body.output : "";
    const category = typeof body.category === "string" ? body.category : "console";
    const level = category === "stderr" ? "error" : category === "important" ? "warn" : "log";
    const source = body.source;
    const line = typeof body.line === "number" ? body.line - 1 : void 0;
    if (source?.path && typeof line === "number") {
      for (const outputLine of rawOutput.split(/\r?\n/)) {
        this.processLineWithKnownLocation(outputLine, source.path, line, level);
      }
      return;
    }
    for (const outputLine of rawOutput.split(/\r?\n/)) {
      this.processOutputLine(outputLine, level);
    }
  }
  processLineWithKnownLocation(line, filePath, lineNumber, level) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const structured = parseStructuredPayload(trimmed);
    if (structured) {
      this.processStructuredPayload(structured);
      return;
    }
    if (trimmed.startsWith("__ghostlog_logpoint__:")) {
      const entry2 = this.createLogpointEntry(trimmed, level, filePath, lineNumber);
      this.addEntry(filePath, lineNumber, entry2);
      return;
    }
    const entry = this.createBaseEntry(trimmed, level, filePath, lineNumber);
    this.addEntry(filePath, lineNumber, entry);
  }
  processOutputLine(line, level) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const structured = parseStructuredPayload(trimmed);
    if (structured) {
      this.processStructuredPayload(structured);
      return;
    }
    const entry = parseLogLine(trimmed, level);
    const locations = [...this.indexedConsoleLocations.values()].flat();
    const location = matchOutputToLocation(entry, locations);
    if (!location) {
      return;
    }
    this.addEntry(location.file, location.line, this.createBaseEntry(trimmed, level, location.file, location.line));
  }
  processStructuredPayload(payload) {
    if (payload.type === "network") {
      const network = {
        url: payload.url ?? "",
        method: (payload.method ?? "GET").toUpperCase(),
        status: payload.status,
        error: payload.error,
        duration: payload.duration ?? 0,
        timestamp: payload.timestamp ?? Date.now()
      };
      const locations = [...this.indexedNetworkLocations.values()].flat();
      const location = matchNetworkToLocation(network, locations);
      if (!location) {
        return;
      }
      this.addEntry(location.file, location.line, {
        raw: formatNetworkEntry(network),
        level: network.error ? "error" : "info",
        values: [network.url],
        timestamp: network.timestamp,
        kind: "network",
        file: location.file,
        line: location.line,
        network
      });
      return;
    }
    if (payload.type === "timing" && payload.phase === "end" && payload.label) {
      const locations = [...this.indexedConsoleLocations.values()].flat().filter((location2) => location2.callText.includes("console.timeEnd"));
      const location = matchOutputToLocation(parseLogLine(`${payload.label}: ${payload.duration ?? 0}ms`, "log"), locations) ?? locations[0];
      if (!location) {
        return;
      }
      const duration = payload.duration ?? 0;
      this.addEntry(location.file, location.line, {
        raw: `${payload.label}: ${duration}ms`,
        level: classifyDuration(duration) === "slow" ? "error" : classifyDuration(duration) === "medium" ? "warn" : "info",
        values: [`${duration}ms`],
        label: `${payload.label}:`,
        timestamp: payload.timestamp ?? Date.now(),
        kind: "timing",
        file: location.file,
        line: location.line,
        timing: {
          label: payload.label,
          phase: "end",
          startTime: payload.startTime,
          endTime: payload.endTime,
          duration
        }
      });
    }
  }
  createBaseEntry(rawLine, level, filePath, line) {
    return {
      ...parseLogLine(rawLine, level),
      file: filePath,
      line
    };
  }
  createLogpointEntry(rawLine, level, filePath, line) {
    const rest = rawLine.slice("__ghostlog_logpoint__:".length);
    const [id, expression, ...valueParts] = rest.split(":");
    const value = valueParts.join(":").trim();
    return {
      raw: value || rawLine,
      level,
      values: value ? [value] : [],
      timestamp: Date.now(),
      kind: "logpoint",
      file: filePath,
      line,
      logpointId: id,
      expression
    };
  }
  addEntry(filePath, line, entry) {
    const byLine = this.entriesByFile.get(filePath) ?? /* @__PURE__ */ new Map();
    const entries = byLine.get(line) ?? [];
    byLine.set(line, [...entries, entry]);
    this.entriesByFile.set(filePath, byLine);
    this.entryOrder.push(entry);
    this.currentDiff = void 0;
    this.refreshViewer();
    this.syncReplContext();
    this.renderEditorForFile(filePath);
  }
  syncReplContext() {
    const recentEntries = this.entryOrder.filter((entry) => entry.kind !== "network" && entry.kind !== "timing").slice(-25).reverse();
    const values = [];
    for (const [index, entry] of recentEntries.entries()) {
      const rawValue = entry.values.length <= 1 ? entry.values[0] ?? entry.raw : `[${entry.values.join(", ")}]`;
      values.push({ key: this.toReplKey(entry, index), raw: rawValue });
    }
    this.replPanel.updateCapturedValues(values);
  }
  toReplKey(entry, index) {
    const fileName = entry.file ? import_node_path2.default.basename(entry.file).replace(/[^A-Za-z0-9_$]/g, "_") : "unknown";
    const line = typeof entry.line === "number" ? entry.line + 1 : index;
    return `$${fileName}_${line}`;
  }
  getEntriesForLine(filePath, line) {
    return this.entriesByFile.get(filePath)?.get(line) ?? [];
  }
  renderAllVisibleEditors() {
    for (const editor of vscode4.window.visibleTextEditors) {
      this.renderEditor(editor);
    }
  }
  renderEditorForFile(filePath) {
    for (const editor of vscode4.window.visibleTextEditors) {
      if (editor.document.uri.fsPath === filePath) {
        this.renderEditor(editor);
      }
    }
  }
  renderEditor(editor) {
    for (const level of Object.keys(this.decorationTypes)) {
      if (!this.enabled) {
        editor.setDecorations(this.decorationTypes[level], []);
        continue;
      }
      const byLine = this.entriesByFile.get(editor.document.uri.fsPath);
      const decorations = [];
      if (byLine) {
        for (const [lineNumber, entries] of byLine.entries()) {
          const line = editor.document.lineAt(lineNumber);
          const levelForLine = entries.find((entry) => entry.level === "error")?.level ?? entries.find((entry) => entry.level === "warn")?.level ?? entries[0]?.level;
          if (levelForLine !== level) {
            continue;
          }
          decorations.push({
            range: new vscode4.Range(line.range.end, line.range.end),
            renderOptions: {
              after: {
                contentText: buildDecorationText(
                  entries.slice(-this.getConfig("maxLoopValues", 5)).map((entry) => this.truncateEntry(entry))
                )
              }
            }
          });
        }
      }
      editor.setDecorations(this.decorationTypes[level], decorations);
    }
  }
  truncateEntry(entry) {
    if (entry.kind === "network" || entry.kind === "timing") {
      return entry;
    }
    const maxValueLength = this.getConfig("maxValueLength", 60);
    return {
      ...entry,
      values: entry.values.map((value) => truncateValue(value, maxValueLength))
    };
  }
  async addLogpointHere() {
    const editor = vscode4.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const expression = await vscode4.window.showInputBox({
      prompt: "Expression to log at this line",
      placeHolder: "user.id"
    });
    if (!expression) {
      return;
    }
    this.logpointManager.add(editor.document.uri.fsPath, editor.selection.active.line, expression);
    this.syncLogpointsToBreakpoints();
    vscode4.window.showInformationMessage("GhostLog logpoint added.");
  }
  syncLogpointsToBreakpoints() {
    if (this.ghostlogBreakpoints.length > 0) {
      vscode4.debug.removeBreakpoints(this.ghostlogBreakpoints);
    }
    this.ghostlogBreakpoints = this.logpointManager.list().map((logpoint) => this.toBreakpoint(logpoint));
    if (this.ghostlogBreakpoints.length > 0) {
      vscode4.debug.addBreakpoints(this.ghostlogBreakpoints);
    }
  }
  toBreakpoint(logpoint) {
    const location = new vscode4.Location(vscode4.Uri.file(logpoint.file), new vscode4.Position(logpoint.line, 0));
    const logMessage = `__ghostlog_logpoint__:${logpoint.id}:${logpoint.expression}: {${logpoint.expression}}`;
    return new vscode4.SourceBreakpoint(location, logpoint.enabled, void 0, void 0, logMessage);
  }
  snapshotLogs() {
    const snapshot = this.diffManager.saveSnapshot(this.entryOrder);
    vscode4.window.showInformationMessage(`GhostLog snapshot saved (${snapshot.id}).`);
  }
  diffLogs() {
    const previous = this.diffManager.getLastSnapshot();
    if (!previous) {
      vscode4.window.showWarningMessage("GhostLog has no snapshot yet.");
      return;
    }
    this.currentDiff = this.diffManager.diff(previous, {
      id: "current",
      timestamp: Date.now(),
      entries: [...this.entryOrder]
    });
    this.refreshViewer();
    void vscode4.commands.executeCommand("ghostlog.logViewer.focus");
  }
  async exportAll() {
    await vscode4.env.clipboard.writeText(JSON.stringify(this.entryOrder, null, 2));
    vscode4.window.showInformationMessage("GhostLog logs copied as JSON.");
  }
  openEntry(entryId) {
    const index = Number(entryId.split(":", 1)[0]);
    const entry = this.entryOrder[index];
    if (!entry?.file || typeof entry.line !== "number") {
      return;
    }
    void vscode4.window.showTextDocument(vscode4.Uri.file(entry.file)).then((editor) => {
      const position = new vscode4.Position(entry.line, 0);
      editor.selection = new vscode4.Selection(position, position);
      editor.revealRange(new vscode4.Range(position, position), vscode4.TextEditorRevealType.InCenter);
    });
  }
  refreshViewer() {
    this.logViewer.update(this.entryOrder, this.currentDiff);
  }
  async injectDebugRuntime(session) {
    try {
      await session.customRequest("evaluate", {
        expression: generateInjectionScript(),
        context: "repl"
      });
    } catch {
    }
  }
  startMcp() {
    if (this.mcpServer) {
      return;
    }
    const port = this.getConfig("mcpPort", 5678);
    this.mcpServer = startMcpServer(port, {
      getRecentLogs: () => [...this.entryOrder],
      getErrors: () => this.entryOrder.filter((entry) => entry.level === "error"),
      getNetworkRequests: () => this.entryOrder.flatMap((entry) => entry.network ? [entry.network] : []),
      searchLogs: (query) => this.entryOrder.filter(
        (entry) => JSON.stringify(entry).toLowerCase().includes(query.toLowerCase())
      )
    });
    vscode4.window.showInformationMessage(`GhostLog MCP server listening on 127.0.0.1:${port}.`);
  }
  stopMcp() {
    if (!this.mcpServer) {
      return;
    }
    const server = this.mcpServer;
    this.mcpServer = void 0;
    void server.stop().then(() => {
      vscode4.window.showInformationMessage("GhostLog MCP server stopped.");
    });
  }
};
function activate(context) {
  const controller = new GhostLogController(context);
  context.subscriptions.push(controller, ...controller.register());
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
