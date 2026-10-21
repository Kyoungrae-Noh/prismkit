import type { IncomingMessage, ServerResponse } from 'node:http'
import { ApiError } from './service.ts'
import type { SearchAdResponse } from '../../src/providers/searchad-types.ts'
export function createHandler(
  query: ((keyword: unknown) => Promise<SearchAdResponse>) & { usage?: () => unknown },
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const fail = (status: number, code: string, message: string) => {
      res.writeHead(status)
      res.end(JSON.stringify({ error: { code, message } }))
    }
    if (
      req.headers.host !== '127.0.0.1:4179' ||
      req.headers['x-prismkit-request'] !== 'keyword-query' ||
      (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:5173')
    )
      return fail(403, 'FORBIDDEN', '로컬 Prismkit 요청만 허용합니다.')
    if (req.method !== 'GET') return fail(405, 'METHOD', 'GET 요청만 허용합니다.')
    const url = new URL(req.url ?? '/', 'http://127.0.0.1:4179')
    if (!['/api/searchad/keyword', '/api/searchad/usage'].includes(url.pathname))
      return fail(404, 'NOT_FOUND', '지원하지 않는 경로입니다.')
    try {
      const data = url.pathname.endsWith('/usage')
        ? query.usage?.()
        : await query(url.searchParams.get('keyword'))
      res.writeHead(200)
      res.end(JSON.stringify(data))
    } catch (error) {
      if (error instanceof ApiError) fail(error.status, error.code, error.message)
      else fail(500, 'INTERNAL', '서버 요청을 처리하지 못했습니다.')
    }
  }
}
