# GhostLog

GhostLog is a VSCode extension that shows `console.log`, `console.warn`, and `console.error` output inline beside the source line that produced it.

## What It Looks Like

```ts
const user = getUser()
console.log("user:", user)   // 👻 { id: 1, name: "Alice", email: "alice@co.com" }

for (let i = 0; i < 3; i++) {
  console.log("i:", i)       // 👻 0  1  2
}

const err = new Error("oops")
console.error("error:", err) // ⚠ Error: oops at index.ts:8
```

## Install

- Install from the VS Marketplace when published.
- Or build a `.vsix` locally with `pnpm package` and install it from VSCode.

## How It Works

GhostLog listens to debug adapter output events and terminal output, parses emitted console text, matches it back to `console.*` calls in open JavaScript and TypeScript files, then renders the latest values as inline editor decorations.

Best results come from labeled logs such as `console.log("user:", user)`, because the label makes source matching deterministic.

## Commands

- `GhostLog: Clear All Inline Values`
- `GhostLog: Toggle Inline Display`
- `GhostLog: Clear This File`

## Settings

- `ghostlog.enabled`: enable or disable GhostLog.
- `ghostlog.maxValueLength`: max characters shown per inline value.
- `ghostlog.maxLoopValues`: max repeated values shown on the same line.

## Comparison With ConsoleNinja

- Free and open source.
- Focused on JavaScript and TypeScript in VSCode.
- Supports Node.js-style output captured from debugger sessions and terminals.
