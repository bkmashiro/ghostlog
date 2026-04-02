import fs from 'node:fs'
import path from 'node:path'

export interface Logpoint {
  id: string
  file: string
  line: number
  expression: string
  enabled: boolean
}

export class LogpointManager {
  private logpoints: Logpoint[] = []

  constructor(private readonly storagePath: string) {
    this.ensureStorage()
    this.logpoints = this.read()
  }

  add(file: string, line: number, expression: string): Logpoint {
    const logpoint: Logpoint = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      line,
      expression,
      enabled: true
    }
    this.logpoints.push(logpoint)
    this.write()
    return logpoint
  }

  remove(id: string): void {
    this.logpoints = this.logpoints.filter((logpoint) => logpoint.id !== id)
    this.write()
  }

  list(): Logpoint[] {
    return [...this.logpoints]
  }

  getForFile(file: string): Logpoint[] {
    return this.logpoints.filter((logpoint) => logpoint.file === file)
  }

  private ensureStorage(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true })
    if (!fs.existsSync(this.storagePath)) {
      fs.writeFileSync(this.storagePath, '[]', 'utf8')
    }
  }

  private read(): Logpoint[] {
    try {
      const content = fs.readFileSync(this.storagePath, 'utf8')
      const parsed = JSON.parse(content)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private write(): void {
    fs.writeFileSync(this.storagePath, JSON.stringify(this.logpoints, null, 2), 'utf8')
  }
}
