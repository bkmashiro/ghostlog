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
var vscode2 = __toESM(require("vscode"));

// src/commands.ts
var vscode = __toESM(require("vscode"));
function registerCommands(handlers) {
  return [
    vscode.commands.registerCommand("ghostlog.clear", handlers.clearAll),
    vscode.commands.registerCommand("ghostlog.toggle", handlers.toggle),
    vscode.commands.registerCommand("ghostlog.clearFile", handlers.clearFile)
  ];
}

// src/parser.ts
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

// src/decorator.ts
function buildDecorationText(entries) {
  if (entries.length === 0) {
    return "";
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

// src/tracker.ts
var CONSOLE_METHODS = ["log", "warn", "error", "info"];
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
  const match = callText.match(/console\.(?:log|warn|error|info)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/s);
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
        callText: fileContent.slice(start, end + 1)
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

// src/extension.ts
var GhostLogController = class {
  constructor(context) {
    this.context = context;
    this.enabled = this.getConfig("enabled", true);
    this.decorationTypes = {
      log: vscode2.window.createTextEditorDecorationType(getDecorationOptions("log")),
      info: vscode2.window.createTextEditorDecorationType(getDecorationOptions("info")),
      warn: vscode2.window.createTextEditorDecorationType(getDecorationOptions("warn")),
      error: vscode2.window.createTextEditorDecorationType(getDecorationOptions("error"))
    };
  }
  decorationTypes;
  indexedLocations = /* @__PURE__ */ new Map();
  entriesByFile = /* @__PURE__ */ new Map();
  terminalBuffers = /* @__PURE__ */ new Map();
  enabled;
  dispose() {
    for (const decorationType of Object.values(this.decorationTypes)) {
      decorationType.dispose();
    }
  }
  register() {
    const disposables = [];
    disposables.push(
      ...registerCommands({
        clearAll: () => this.clearAll(),
        toggle: () => this.toggle(),
        clearFile: () => this.clearFile(vscode2.window.activeTextEditor?.document.uri.fsPath)
      })
    );
    disposables.push(
      vscode2.workspace.onDidOpenTextDocument((document) => this.indexDocument(document)),
      vscode2.workspace.onDidSaveTextDocument((document) => this.indexDocument(document)),
      vscode2.workspace.onDidChangeTextDocument((event) => {
        this.clearFile(event.document.uri.fsPath);
        this.indexDocument(event.document);
      }),
      vscode2.window.onDidChangeVisibleTextEditors(() => this.renderAllVisibleEditors()),
      vscode2.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("ghostlog")) {
          this.enabled = this.getConfig("enabled", true);
          this.renderAllVisibleEditors();
        }
      })
    );
    if ("onDidWriteTerminalData" in vscode2.window) {
      const terminalEmitter = vscode2.window.onDidWriteTerminalData;
      if (terminalEmitter) {
        disposables.push(
          terminalEmitter((event) => {
            this.captureTerminalOutput(event.terminal, event.data);
          })
        );
      }
    }
    disposables.push(
      vscode2.debug.registerDebugAdapterTrackerFactory("*", {
        createDebugAdapterTracker: () => ({
          onDidSendMessage: (message) => {
            if (message.type === "event" && message.event === "output") {
              this.captureDebugOutput(message.body);
            }
          }
        })
      })
    );
    for (const document of vscode2.workspace.textDocuments) {
      this.indexDocument(document);
    }
    return disposables;
  }
  getConfig(key, fallback) {
    return vscode2.workspace.getConfiguration("ghostlog").get(key, fallback);
  }
  isSupportedDocument(document) {
    return ["javascript", "javascriptreact", "typescript", "typescriptreact"].includes(document.languageId);
  }
  indexDocument(document) {
    if (!this.isSupportedDocument(document)) {
      return;
    }
    this.indexedLocations.set(
      document.uri.fsPath,
      findLogLocations(document.getText(), document.uri.fsPath)
    );
  }
  clearAll() {
    this.entriesByFile.clear();
    this.renderAllVisibleEditors();
  }
  clearFile(filePath) {
    if (!filePath) {
      return;
    }
    this.entriesByFile.delete(filePath);
    this.renderAllVisibleEditors();
  }
  toggle() {
    this.enabled = !this.enabled;
    void vscode2.workspace.getConfiguration("ghostlog").update("enabled", this.enabled, vscode2.ConfigurationTarget.Global);
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
      const entry = this.normalizeEntry(parseLogLine(rawOutput, level));
      this.addEntry(source.path, line, entry);
      return;
    }
    for (const outputLine of rawOutput.split(/\r?\n/)) {
      this.processOutputLine(outputLine, level);
    }
  }
  normalizeEntry(entry) {
    const maxValueLength = this.getConfig("maxValueLength", 60);
    return {
      ...entry,
      values: entry.values.map((value) => truncateValue(value, maxValueLength))
    };
  }
  processOutputLine(line, level) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const entry = this.normalizeEntry(parseLogLine(trimmed, level));
    const locations = [...this.indexedLocations.values()].flat();
    const location = matchOutputToLocation(entry, locations);
    if (!location) {
      return;
    }
    this.addEntry(location.file, location.line, entry);
  }
  addEntry(filePath, line, entry) {
    const byLine = this.entriesByFile.get(filePath) ?? /* @__PURE__ */ new Map();
    const entries = byLine.get(line) ?? [];
    byLine.set(line, [...entries, entry]);
    this.entriesByFile.set(filePath, byLine);
    this.renderEditorForFile(filePath);
  }
  renderAllVisibleEditors() {
    for (const editor of vscode2.window.visibleTextEditors) {
      this.renderEditor(editor);
    }
  }
  renderEditorForFile(filePath) {
    for (const editor of vscode2.window.visibleTextEditors) {
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
            range: new vscode2.Range(line.range.end, line.range.end),
            renderOptions: {
              after: {
                contentText: buildDecorationText(
                  entries.slice(-this.getConfig("maxLoopValues", 5))
                )
              }
            }
          });
        }
      }
      editor.setDecorations(this.decorationTypes[level], decorations);
    }
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
