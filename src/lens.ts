import fs from 'node:fs'
import path from 'node:path'
import * as vm from 'node:vm'

export interface Lens {
  id: string
  file: string
  line: number
  expression: string
  enabled: boolean
  label?: string
}

function ensureStorageDir(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, '.ghostlog')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getStoragePath(workspaceRoot: string): string {
  return path.join(ensureStorageDir(workspaceRoot), 'lenses.json')
}

export class LensStore {
  private lenses: Map<string, Lens> = new Map()

  load(workspaceRoot: string): void {
    const storagePath = getStoragePath(workspaceRoot)
    if (!fs.existsSync(storagePath)) {
      this.lenses.clear()
      return
    }

    try {
      const raw = fs.readFileSync(storagePath, 'utf8')
      const parsed = JSON.parse(raw) as Lens[]
      this.lenses = new Map(parsed.map((lens) => [lens.id, lens]))
    } catch {
      this.lenses.clear()
    }
  }

  save(workspaceRoot: string): void {
    const storagePath = getStoragePath(workspaceRoot)
    fs.writeFileSync(storagePath, JSON.stringify(this.list(), null, 2))
  }

  add(file: string, line: number, expression: string, label?: string): Lens {
    const lens: Lens = {
      id: `${file}:${line}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      file,
      line,
      expression,
      enabled: true,
      label
    }
    this.lenses.set(lens.id, lens)
    return lens
  }

  remove(id: string): void {
    this.lenses.delete(id)
  }

  update(id: string, expression: string, label?: string): Lens | undefined {
    const lens = this.lenses.get(id)
    if (!lens) {
      return undefined
    }
    lens.expression = expression
    lens.label = label
    return lens
  }

  getForLine(file: string, line: number): Lens | undefined {
    return this.list().find((lens) => lens.file === file && lens.line === line)
  }

  list(): Lens[] {
    return [...this.lenses.values()].sort((left, right) => {
      if (left.file !== right.file) {
        return left.file.localeCompare(right.file)
      }
      if (left.line !== right.line) {
        return left.line - right.line
      }
      return left.id.localeCompare(right.id)
    })
  }

  toggle(id: string): void {
    const lens = this.lenses.get(id)
    if (!lens) {
      return
    }
    lens.enabled = !lens.enabled
  }
}

function normalizeExpression(expression: string): string {
  const trimmed = expression.trim()
  if (!trimmed) {
    return 'x'
  }
  if (trimmed.startsWith('.')) {
    return `x${trimmed}`
  }
  return trimmed
}

function isArrowExpression(expression: string): boolean {
  return /^\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(expression)
}

export function applyLens(value: unknown, expression: string): { result: unknown; error?: string } {
  const normalized = normalizeExpression(expression)
  const sandbox = Object.create(null) as Record<string, unknown>
  sandbox.x = value
  sandbox.$ = value
  sandbox.$0 = value
  sandbox.JSON = JSON
  sandbox.Math = Math
  sandbox.Array = Array
  sandbox.Object = Object
  sandbox.String = String
  sandbox.Number = Number
  sandbox.Boolean = Boolean
  sandbox.Date = Date
  sandbox.RegExp = RegExp

  try {
    const isArrow = isArrowExpression(normalized)
    const result = vm.runInNewContext(
      isArrow ? `(${normalized})(x)` : normalized,
      sandbox,
      { timeout: 100 }
    )
    return { result }
  } catch (error) {
    try {
      const result = vm.runInNewContext(`(() => { ${normalized} })()`, sandbox, { timeout: 100 })
      return { result }
    } catch (nestedError) {
      return {
        result: undefined,
        error: nestedError instanceof Error ? nestedError.message : String(nestedError)
      }
    }
  }
}
