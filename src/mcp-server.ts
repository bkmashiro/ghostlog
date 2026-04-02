import http from 'node:http'
import type { LogEntry, NetworkEntry } from './types.js'

export interface McpDataSource {
  getRecentLogs: () => LogEntry[]
  getErrors: () => LogEntry[]
  getNetworkRequests: () => NetworkEntry[]
  searchLogs: (query: string) => LogEntry[]
}

export interface McpServerHandle {
  stop: () => Promise<void>
}

export function startMcpServer(port: number, dataSource: McpDataSource): McpServerHandle {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        const message = JSON.parse(body) as {
          id?: string | number | null
          method?: string
          params?: { query?: string }
        }
        const result = handleMethod(message.method, message.params, dataSource)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id ?? null, result }))
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: String(error) }
          })
        )
      }
    })
  })

  server.listen(port, '127.0.0.1')

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
  }
}

function handleMethod(
  method: string | undefined,
  params: { query?: string } | undefined,
  dataSource: McpDataSource
): LogEntry[] | NetworkEntry[] {
  switch (method) {
    case 'get_recent_logs':
      return dataSource.getRecentLogs()
    case 'get_errors':
      return dataSource.getErrors()
    case 'get_network_requests':
      return dataSource.getNetworkRequests()
    case 'search_logs':
      return dataSource.searchLogs(params?.query ?? '')
    default:
      throw new Error(`Unsupported method: ${method ?? 'unknown'}`)
  }
}
