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
var import_node_path3 = __toESM(require("node:path"));
var vscode4 = __toESM(require("vscode"));

// src/classifier.ts
function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}
function detectPattern(value) {
  if (value === null) {
    return "null";
  }
  const type = typeof value;
  if (type !== "object") {
    return type;
  }
  if (Array.isArray(value)) {
    return "Array";
  }
  const constructorName = value.constructor?.name?.trim() ?? "";
  if (constructorName && constructorName !== "Object") {
    return constructorName;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.join(",")}}`;
  }
  return "object";
}
function classifyEntries(entries) {
  const patterns = /* @__PURE__ */ new Map();
  for (const value of entries) {
    const signature = detectPattern(value);
    const now = Date.now();
    const current = patterns.get(signature);
    if (current) {
      current.count += 1;
      current.lastSeen = now;
      if (current.examples.length < 3) {
        current.examples.push(value);
      }
      continue;
    }
    patterns.set(signature, {
      signature,
      count: 1,
      examples: [value],
      firstSeen: now,
      lastSeen: now
    });
  }
  return patterns;
}
function summarizePatterns(patterns) {
  const ordered = [...patterns.values()].sort((left, right) => right.count - left.count);
  if (ordered.length === 0) {
    return "";
  }
  const summary = ordered.map((pattern) => `${pattern.signature}\xD7${pattern.count}`).join(", ");
  if (ordered.length === 1) {
    return summary;
  }
  return `[${ordered.length} patterns] ${summary}`;
}

// src/lens.ts
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var vm = __toESM(require("node:vm"));
function ensureStorageDir(workspaceRoot) {
  const dir = import_node_path.default.join(workspaceRoot, ".ghostlog");
  import_node_fs.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function getStoragePath(workspaceRoot) {
  return import_node_path.default.join(ensureStorageDir(workspaceRoot), "lenses.json");
}
var LensStore = class {
  lenses = /* @__PURE__ */ new Map();
  load(workspaceRoot) {
    const storagePath = getStoragePath(workspaceRoot);
    if (!import_node_fs.default.existsSync(storagePath)) {
      this.lenses.clear();
      return;
    }
    try {
      const raw = import_node_fs.default.readFileSync(storagePath, "utf8");
      const parsed = JSON.parse(raw);
      this.lenses = new Map(parsed.map((lens) => [lens.id, lens]));
    } catch {
      this.lenses.clear();
    }
  }
  save(workspaceRoot) {
    const storagePath = getStoragePath(workspaceRoot);
    import_node_fs.default.writeFileSync(storagePath, JSON.stringify(this.list(), null, 2));
  }
  add(file, line, expression, label) {
    const lens = {
      id: `${file}:${line}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      file,
      line,
      expression,
      enabled: true,
      label
    };
    this.lenses.set(lens.id, lens);
    return lens;
  }
  remove(id) {
    this.lenses.delete(id);
  }
  update(id, expression, label) {
    const lens = this.lenses.get(id);
    if (!lens) {
      return void 0;
    }
    lens.expression = expression;
    lens.label = label;
    return lens;
  }
  getForLine(file, line) {
    return this.list().find((lens) => lens.file === file && lens.line === line);
  }
  list() {
    return [...this.lenses.values()].sort((left, right) => {
      if (left.file !== right.file) {
        return left.file.localeCompare(right.file);
      }
      if (left.line !== right.line) {
        return left.line - right.line;
      }
      return left.id.localeCompare(right.id);
    });
  }
  toggle(id) {
    const lens = this.lenses.get(id);
    if (!lens) {
      return;
    }
    lens.enabled = !lens.enabled;
  }
};
function normalizeExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed) {
    return "x";
  }
  if (trimmed.startsWith(".")) {
    return `x${trimmed}`;
  }
  return trimmed;
}
function applyLens(value, expression) {
  const normalized = normalizeExpression(expression);
  const sandbox = /* @__PURE__ */ Object.create(null);
  sandbox.x = value;
  sandbox.$ = value;
  sandbox.$0 = value;
  sandbox.JSON = JSON;
  sandbox.Math = Math;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.String = String;
  sandbox.Number = Number;
  sandbox.Boolean = Boolean;
  sandbox.Date = Date;
  sandbox.RegExp = RegExp;
  try {
    const isArrow = normalized.includes("=>");
    const result = vm.runInNewContext(
      isArrow ? `(${normalized})(x)` : normalized,
      sandbox,
      { timeout: 100 }
    );
    return { result };
  } catch (error) {
    try {
      const result = vm.runInNewContext(`(() => { ${normalized} })()`, sandbox, { timeout: 100 });
      return { result };
    } catch (nestedError) {
      return {
        result: void 0,
        error: nestedError instanceof Error ? nestedError.message : String(nestedError)
      };
    }
  }
}

// src/commands.ts
var vscode = __toESM(require("vscode"));
function registerCommands(handlers) {
  return [
    vscode.commands.registerCommand("ghostlog.clear", handlers.clearAll),
    vscode.commands.registerCommand("ghostlog.toggle", handlers.toggle),
    vscode.commands.registerCommand("ghostlog.clearFile", handlers.clearFile),
    vscode.commands.registerCommand("ghostlog.addLogpoint", handlers.addLogpoint),
    vscode.commands.registerCommand("ghostlog.addLens", handlers.addLens),
    vscode.commands.registerCommand("ghostlog.editLens", handlers.editLens),
    vscode.commands.registerCommand("ghostlog.removeLens", handlers.removeLens),
    vscode.commands.registerCommand("ghostlog.pinPath", handlers.pinPath),
    vscode.commands.registerCommand("ghostlog.snapshotLogs", handlers.snapshotLogs),
    vscode.commands.registerCommand("ghostlog.diffLogs", handlers.diffLogs),
    vscode.commands.registerCommand("ghostlog.startMcp", handlers.startMcp),
    vscode.commands.registerCommand("ghostlog.stopMcp", handlers.stopMcp),
    vscode.commands.registerCommand("ghostlog.focusLogViewer", handlers.focusLogViewer),
    vscode.commands.registerCommand("ghostlog.focusLineInViewer", handlers.focusLineInViewer)
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

// src/repl.ts
var vm2 = __toESM(require("node:vm"));
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
    return vm2.runInNewContext(`(${trimmed})`, /* @__PURE__ */ Object.create(null), { timeout: 50 });
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
      const result = vm2.runInNewContext(expression, sandbox, { timeout: 1e3 });
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

// src/decorator.ts
function buildDecorationText(entries, options) {
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
  const latestLens = entries.at(-1)?.lens;
  if (latestLens) {
    const rendered = latestLens.error ? `Error: ${latestLens.error}` : formatValue(latestLens.result, 2);
    return `${prefix} (lens: ${latestLens.label ?? latestLens.expression}) \u2192 ${rendered}`;
  }
  if (options?.patternSummary) {
    return `${prefix} ${options.patternSummary}`;
  }
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
  pins = [];
  focusedLine;
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
      } else if (message.type === "pin" && typeof message.file === "string" && typeof message.line === "number" && typeof message.path === "string") {
        this.actions.pinPath(message.file, message.line, message.path);
      } else if (message.type === "removePin" && typeof message.id === "string") {
        this.actions.removePin(message.id);
      } else if (message.type === "focusLine" && typeof message.file === "string" && typeof message.line === "number") {
        this.actions.focusLine(message.file, message.line);
      }
    });
    this.render();
  }
  update(entries, diff, pins = []) {
    this.entries = [...entries];
    this.diff = diff;
    this.pins = [...pins];
    this.render();
  }
  setFocusedLine(file, line) {
    this.focusedLine = { file, line };
    this.render();
  }
  render() {
    if (!this.view) {
      return;
    }
    const focus = this.focusedLine ?? this.getLatestLine();
    const focusEntries = focus ? this.entries.filter((entry) => entry.file === focus.file && entry.line === focus.line) : [];
    const focusPatterns = classifyEntries(
      focusEntries.map((entry) => entry.parsedValue).filter((value) => value !== void 0)
    );
    const maxPatternCount = Math.max(...[...focusPatterns.values()].map((pattern) => pattern.count), 1);
    const latestFocusedEntry = focusEntries.at(-1);
    const diffBanner = this.diff ? `<div class="diff">Diff mode: +${this.diff.added.length} / -${this.diff.removed.length} / ~${this.diff.changed.length}</div>` : "";
    const focusBanner = focus ? `<div class="focus">Focused line: ${escapeHtml(
      `${vscode3.workspace.asRelativePath(focus.file)}:${focus.line + 1}`
    )}</div>` : '<div class="focus">Focused line: none</div>';
    const rows = this.entries.map((entry, index) => {
      const id = `${index}:${entry.file ?? ""}:${entry.line ?? -1}:${entry.timestamp}`;
      const value = escapeHtml(
        entry.kind === "network" ? entry.network ? `${entry.network.method} ${entry.network.status ?? "ERR"} ${entry.network.duration}ms ${entry.network.url}` : entry.raw : entry.lens ? formatValue(entry.lens.result, 2) : entry.values.join(" ") || entry.raw
      );
      const file = entry.file ?? "unknown";
      const line = entry.line ?? -1;
      const signature = escapeHtml(entry.patternSignature ?? "");
      const fileLine = escapeHtml(`${vscode3.workspace.asRelativePath(file)}:${line + 1}`);
      const time = escapeHtml(new Date(entry.timestamp).toLocaleTimeString());
      const level = escapeHtml(entry.level.toUpperCase());
      const rowClass = entry.level;
      const isFocused = focus ? file === focus.file && line === focus.line : false;
      return `<tr class="row ${rowClass} ${isFocused ? "focused-row" : ""}" data-entry-id="${id}" data-pattern="${signature}" data-file="${escapeHtml(file)}" data-line="${line}">
          <td>${time}</td>
          <td>${fileLine}</td>
          <td>${level}</td>
          <td title="${value}">${value}</td>
          <td class="actions">
            <button type="button" data-focus="${escapeHtml(file)}:${line}">focus</button>
            <button type="button" data-open-entry="${id}">open</button>
          </td>
        </tr>`;
    }).join("");
    const patternsMarkup = focusPatterns.size ? [...focusPatterns.values()].sort((left, right) => right.count - left.count).map((pattern) => {
      const width = `${Math.max(8, Math.round(pattern.count / maxPatternCount * 100))}%`;
      const examples = escapeHtml(pattern.examples.map((example) => formatValue(example, 1)).join(" | "));
      return `<button class="pattern" type="button" data-pattern-filter="${escapeHtml(pattern.signature)}">
              <div class="pattern-head">
                <strong>${escapeHtml(pattern.signature)}</strong>
                <span>${pattern.count}</span>
              </div>
              <div class="histogram"><span style="width:${width}"></span></div>
              <div class="pattern-example" title="${examples}">${examples}</div>
            </button>`;
    }).join("") : '<div class="empty">No pattern data for this line yet.</div>';
    const pinsMarkup = this.pins.length ? this.pins.map((pin) => {
      const history = pin.history.length ? pin.history.map((entry) => {
        const value = escapeHtml(formatValue(entry.value, 2));
        const time = escapeHtml(new Date(entry.timestamp).toLocaleTimeString());
        return `<div class="pin-history-item ${entry.changed ? "changed" : ""}"><span>${time}</span><span>${value}</span></div>`;
      }).join("") : '<div class="empty">(waiting for updates...)</div>';
      return `<div class="pin-card">
              <div class="pin-head">
                <strong>${escapeHtml(pin.path)}</strong>
                <button type="button" data-remove-pin="${escapeHtml(pin.id)}">remove</button>
              </div>
              <div class="pin-meta">${escapeHtml(`${vscode3.workspace.asRelativePath(pin.file)}:${pin.line + 1}`)}</div>
              ${history}
            </div>`;
    }).join("") : '<div class="empty">No pinned paths yet.</div>';
    const detailMarkup = focus && latestFocusedEntry?.parsedValue !== void 0 ? this.renderPinnedValueTree(latestFocusedEntry.parsedValue, focus.file, focus.line) : '<div class="empty">Select a structured value to browse pin paths.</div>';
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
</html>`;
  }
  getLatestLine() {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry.file && typeof entry.line === "number") {
        return { file: entry.file, line: entry.line };
      }
    }
    return void 0;
  }
  renderPinnedValueTree(value, file, line, path4 = "", depth = 0) {
    const rows = [];
    const preview = escapeHtml(formatValue(value, 1));
    if (path4) {
      rows.push(
        `<div class="tree-row" style="--indent:${depth * 14}px">
          <span class="tree-path">${escapeHtml(path4)}</span>
          <span class="tree-value">${preview}</span>
          <button type="button" data-pin-path="${escapeHtml(path4)}" data-file="${escapeHtml(file)}" data-line="${line}">pin</button>
        </div>`
      );
    }
    if (Array.isArray(value)) {
      value.slice(0, 8).forEach((entry, index) => {
        const nextPath = path4 ? `${path4}[${index}]` : `[${index}]`;
        rows.push(this.renderPinnedValueTree(entry, file, line, nextPath, depth + 1));
      });
      return rows.join("");
    }
    if (value && typeof value === "object") {
      Object.entries(value).slice(0, 12).forEach(([key, entry]) => {
        const nextPath = path4 ? `${path4}.${key}` : key;
        rows.push(this.renderPinnedValueTree(entry, file, line, nextPath, depth + 1));
      });
    }
    return rows.join("");
  }
};
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// src/logpoint.ts
var import_node_fs2 = __toESM(require("node:fs"));
var import_node_path2 = __toESM(require("node:path"));
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
    import_node_fs2.default.mkdirSync(import_node_path2.default.dirname(this.storagePath), { recursive: true });
    if (!import_node_fs2.default.existsSync(this.storagePath)) {
      import_node_fs2.default.writeFileSync(this.storagePath, "[]", "utf8");
    }
  }
  read() {
    try {
      const content = import_node_fs2.default.readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  write() {
    import_node_fs2.default.writeFileSync(this.storagePath, JSON.stringify(this.logpoints, null, 2), "utf8");
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

// src/pin.ts
function tokenizePath(path4) {
  const tokens = [];
  const pattern = /([^[.\]]+)|\[(\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/g;
  for (const match of path4.matchAll(pattern)) {
    const bare = match[1];
    const bracket = match[2];
    if (bare) {
      tokens.push(bare);
      continue;
    }
    if (!bracket) {
      continue;
    }
    if (/^\d+$/.test(bracket)) {
      tokens.push(bracket);
      continue;
    }
    tokens.push(bracket.slice(1, -1));
  }
  return tokens;
}
function isEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function extractPath(obj, path4) {
  const tokens = tokenizePath(path4);
  let current = obj;
  for (const token of tokens) {
    if (current === null || current === void 0) {
      return { value: void 0, found: false };
    }
    if (Array.isArray(current) && /^\d+$/.test(token)) {
      const index = Number(token);
      if (index >= current.length) {
        return { value: void 0, found: false };
      }
      current = current[index];
      continue;
    }
    if (typeof current === "object" && token in current) {
      current = current[token];
      continue;
    }
    return { value: void 0, found: false };
  }
  return { value: current, found: true };
}
var PinStore = class {
  pins = /* @__PURE__ */ new Map();
  add(file, line, path4) {
    const pin = {
      id: `${file}:${line}:${path4}`,
      file,
      line,
      path: path4,
      history: [],
      maxHistory: 50
    };
    this.pins.set(pin.id, pin);
    return pin;
  }
  remove(id) {
    this.pins.delete(id);
  }
  getForLine(file, line) {
    return this.list().filter((pin) => pin.file === file && pin.line === line);
  }
  list() {
    return [...this.pins.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
  onNewValue(file, line, value) {
    for (const pin of this.getForLine(file, line)) {
      const extracted = extractPath(value, pin.path);
      if (!extracted.found) {
        continue;
      }
      const previous = pin.history.at(-1);
      pin.history.push({
        value: extracted.value,
        timestamp: Date.now(),
        changed: previous ? !isEqual(previous.value, extracted.value) : false
      });
      if (pin.history.length > pin.maxHistory) {
        pin.history.splice(0, pin.history.length - pin.maxHistory);
      }
    }
  }
};

// src/repl-panel.ts
var ReplPanelProvider = class {
  constructor(actions) {
    this.actions = actions;
  }
  static viewType = "ghostlog.repl";
  repl = new GhostlogRepl();
  view;
  pins = [];
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
      } else if (message.type === "removePin" && typeof message.id === "string") {
        this.actions.removePin(message.id);
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
  updatePins(pins) {
    this.pins = pins;
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
            ? '<div class="error">\u2717 ' + escapeHtml(result.error) + '</div>'
            : '<div class="result">\u2190 ' + escapeHtml(result.output) + '</div>');
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
function summarizeEntryPatterns(entries) {
  if (entries.length < 10) {
    return void 0;
  }
  const values = entries.map((entry) => entry.parsedValue).filter((value) => value !== void 0);
  if (values.length < 10) {
    return void 0;
  }
  const patterns = classifyEntries(values);
  if (patterns.size <= 1) {
    return void 0;
  }
  return summarizePatterns(patterns);
}

// src/extension.ts
var GhostLogController = class {
  constructor(context) {
    this.context = context;
    this.enabled = this.getConfig("enabled", true);
    const workspaceRoot = this.getWorkspaceRoot();
    if (workspaceRoot) {
      this.lensStore.load(workspaceRoot);
    }
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
      openEntry: (entryId) => this.openEntry(entryId),
      pinPath: (file, line, pinPath) => this.pinPath(file, line, pinPath),
      removePin: (id) => this.removePin(id),
      focusLine: (file, line) => this.focusLineInViewer(file, line)
    });
    this.replPanel = new ReplPanelProvider({
      removePin: (id) => this.removePin(id)
    });
  }
  decorationTypes;
  indexedConsoleLocations = /* @__PURE__ */ new Map();
  indexedNetworkLocations = /* @__PURE__ */ new Map();
  entriesByFile = /* @__PURE__ */ new Map();
  terminalBuffers = /* @__PURE__ */ new Map();
  entryOrder = [];
  diffManager = new LogDiffManager();
  lensStore = new LensStore();
  pinStore = new PinStore();
  logViewer;
  logpointManager;
  replPanel;
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
        addLens: () => this.addLensHere(),
        editLens: () => this.editLensHere(),
        removeLens: () => this.removeLensHere(),
        pinPath: () => this.pinPathHere(),
        snapshotLogs: () => this.snapshotLogs(),
        diffLogs: () => this.diffLogs(),
        startMcp: () => this.startMcp(),
        stopMcp: () => this.stopMcp(),
        focusLogViewer: () => vscode4.commands.executeCommand("ghostlog.logViewer.focus"),
        focusLineInViewer: (file, line) => this.focusLineInViewer(file, line)
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
  getWorkspaceRoot() {
    return vscode4.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
  isSupportedDocument(document) {
    return ["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(document.languageId);
  }
  resolveLogpointStoragePath() {
    const workspace3 = vscode4.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspace3) {
      return import_node_path3.default.join(workspace3, ".ghostlog", "logpoints.json");
    }
    return import_node_path3.default.join(this.context.globalStorageUri.fsPath, "logpoints.json");
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
    const nextEntry = this.annotateEntry(filePath, line, entry);
    const byLine = this.entriesByFile.get(filePath) ?? /* @__PURE__ */ new Map();
    const entries = byLine.get(line) ?? [];
    byLine.set(line, [...entries, nextEntry]);
    this.entriesByFile.set(filePath, byLine);
    this.entryOrder.push(nextEntry);
    this.currentDiff = void 0;
    this.refreshViewer();
    this.syncReplContext();
    this.renderEditorForFile(filePath);
  }
  syncReplContext() {
    const recentEntries = this.entryOrder.filter((entry) => entry.kind !== "network" && entry.kind !== "timing").slice(-25).reverse();
    const values = /* @__PURE__ */ new Map();
    for (const [index, entry] of recentEntries.entries()) {
      values.set(this.toReplKey(entry, index), entry.parsedValue ?? entry.raw);
    }
    this.replPanel.updateValues(values);
    this.replPanel.updatePins(this.pinStore.list());
  }
  toReplKey(entry, index) {
    const fileName = entry.file ? import_node_path3.default.basename(entry.file).replace(/[^A-Za-z0-9_$]/g, "_") : "unknown";
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
          const command = this.buildLineViewerCommand(editor.document.uri.fsPath, lineNumber);
          const hover = new vscode4.MarkdownString(`[Open in Log Viewer](${command})`);
          hover.isTrusted = true;
          decorations.push({
            range: new vscode4.Range(line.range.end, line.range.end),
            hoverMessage: hover,
            renderOptions: {
              after: {
                contentText: buildDecorationText(
                  entries.slice(-this.getConfig("maxLoopValues", 5)).map((entry) => this.truncateEntry(entry)),
                  {
                    patternSummary: summarizeEntryPatterns(entries)
                  }
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
  async addLensHere() {
    const editor = vscode4.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const line = editor.selection.active.line;
    const existing = this.lensStore.getForLine(editor.document.uri.fsPath, line);
    const expression = await vscode4.window.showInputBox({
      prompt: "Lens expression for this line",
      placeHolder: ".users.length or x => x.name",
      value: existing?.expression ?? ""
    });
    if (!expression) {
      return;
    }
    if (existing) {
      this.lensStore.update(existing.id, expression, existing.label);
    } else {
      this.lensStore.add(editor.document.uri.fsPath, line, expression);
    }
    this.saveLenses();
    this.rebuildLineEntries(editor.document.uri.fsPath, line);
    this.renderEditorForFile(editor.document.uri.fsPath);
    this.refreshViewer();
  }
  async editLensHere() {
    const editor = vscode4.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const lens = this.lensStore.getForLine(editor.document.uri.fsPath, editor.selection.active.line);
    if (!lens) {
      vscode4.window.showWarningMessage("GhostLog has no lens on this line.");
      return;
    }
    const expression = await vscode4.window.showInputBox({
      prompt: "Edit lens expression",
      value: lens.expression
    });
    if (!expression) {
      return;
    }
    this.lensStore.update(lens.id, expression, lens.label);
    this.saveLenses();
    this.rebuildLineEntries(editor.document.uri.fsPath, editor.selection.active.line);
    this.renderEditorForFile(editor.document.uri.fsPath);
    this.refreshViewer();
  }
  removeLensHere() {
    const editor = vscode4.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const lens = this.lensStore.getForLine(editor.document.uri.fsPath, editor.selection.active.line);
    if (!lens) {
      vscode4.window.showWarningMessage("GhostLog has no lens on this line.");
      return;
    }
    this.lensStore.remove(lens.id);
    this.saveLenses();
    this.rebuildLineEntries(editor.document.uri.fsPath, editor.selection.active.line);
    this.renderEditorForFile(editor.document.uri.fsPath);
    this.refreshViewer();
  }
  async pinPathHere() {
    const editor = vscode4.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const pinPath = await vscode4.window.showInputBox({
      prompt: "Path to subscribe for this log line",
      placeHolder: "response.users[0].status"
    });
    if (!pinPath) {
      return;
    }
    this.pinPath(editor.document.uri.fsPath, editor.selection.active.line, pinPath);
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
    this.logViewer.update(this.entryOrder, this.currentDiff, this.pinStore.list());
    this.replPanel.updatePins(this.pinStore.list());
  }
  annotateEntry(filePath, line, entry, trackPins = true) {
    const parsedValue = this.deriveParsedValue(entry);
    const nextEntry = { ...entry, parsedValue };
    if (parsedValue !== void 0) {
      nextEntry.patternSignature = detectPattern(parsedValue);
      if (trackPins) {
        this.pinStore.onNewValue(filePath, line, parsedValue);
      }
    }
    const lens = this.lensStore.getForLine(filePath, line);
    if (lens?.enabled && parsedValue !== void 0) {
      const applied = applyLens(parsedValue, lens.expression);
      nextEntry.lens = {
        expression: lens.expression,
        label: lens.label,
        result: applied.result,
        error: applied.error
      };
    }
    return nextEntry;
  }
  deriveParsedValue(entry) {
    if (entry.kind === "network") {
      return entry.network;
    }
    if (entry.kind === "timing") {
      return entry.timing;
    }
    if (entry.values.length === 1) {
      return reviveCapturedValue(entry.values[0] ?? entry.raw);
    }
    if (entry.values.length > 1) {
      return entry.values.map((value) => reviveCapturedValue(value));
    }
    return entry.raw ? reviveCapturedValue(entry.raw) : void 0;
  }
  rebuildLineEntries(filePath, line) {
    const byLine = this.entriesByFile.get(filePath);
    const entries = byLine?.get(line);
    if (!entries?.length) {
      return;
    }
    const rebuilt = entries.map((entry) => this.annotateEntry(filePath, line, entry, false));
    byLine.set(line, [...rebuilt]);
    for (let index = 0; index < this.entryOrder.length; index += 1) {
      const entry = this.entryOrder[index];
      if (entry.file === filePath && entry.line === line) {
        const next = rebuilt.shift();
        if (next) {
          this.entryOrder[index] = next;
        }
      }
    }
  }
  buildLineViewerCommand(file, line) {
    return `command:ghostlog.focusLineInViewer?${encodeURIComponent(JSON.stringify([file, line]))}`;
  }
  focusLineInViewer(file, line) {
    this.logViewer.setFocusedLine(file, line);
    return vscode4.commands.executeCommand("ghostlog.logViewer.focus");
  }
  pinPath(file, line, pinPath) {
    const existing = this.pinStore.getForLine(file, line).find((pin) => pin.path === pinPath);
    if (!existing) {
      this.pinStore.add(file, line, pinPath);
    }
    for (const entry of this.getEntriesForLine(file, line)) {
      if (entry.parsedValue !== void 0) {
        this.pinStore.onNewValue(file, line, entry.parsedValue);
      }
    }
    this.refreshViewer();
    this.syncReplContext();
  }
  removePin(id) {
    this.pinStore.remove(id);
    this.refreshViewer();
    this.syncReplContext();
  }
  saveLenses() {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      return;
    }
    this.lensStore.save(workspaceRoot);
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
