import { verifyAccess, type AccessSettings } from './access.ts'
import type { SearchAdResponse } from '../src/providers/searchad-types.ts'
export const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
}
export function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: securityHeaders })
}
export async function handleProtected(
  request: Request,
  settings: AccessSettings,
  next: () => Promise<Response>,
  query: (keyword: unknown) => Promise<SearchAdResponse>,
  verify = verifyAccess,
  usage?: () => Promise<unknown>,
  ai?: () => Promise<Response>,
) {
  const url = new URL(request.url)
  // Pages production/preview hosts are never an alternate entry point, even with a valid JWT.
  if (url.hostname !== 'prismkit.online' || url.protocol !== 'https:')
    return failure(403, 'FORBIDDEN', '허용되지 않은 호스트입니다.')
  if (/(?:^|\/)\.(?:env|git|dev.vars)(?:[./]|$)/i.test(decodeURIComponent(url.pathname)))
    return failure(404, 'NOT_FOUND', '지원하지 않는 경로입니다.')
  try {
    await verify(request, settings)
  } catch {
    return failure(401, 'AUTH', '관리자 인증이 필요합니다. 로그인 후 다시 시도하세요.')
  }
  if (url.pathname.startsWith('/api/ai/'))
    return ai ? ai() : failure(503, 'DISABLED', 'AI 판독 미연결')
  if (url.pathname.startsWith('/api/')) {
    if (!['/api/searchad/keyword', '/api/searchad/usage'].includes(url.pathname))
      return failure(404, 'NOT_FOUND', '지원하지 않는 API입니다.')
    if (request.method !== 'GET') return failure(405, 'METHOD', 'GET 요청만 허용합니다.')
    if (
      request.headers.get('x-prismkit-request') !== 'keyword-query' ||
      (request.headers.has('origin') &&
        request.headers.get('origin') !== 'https://prismkit.online') ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return failure(403, 'FORBIDDEN', 'Prismkit 화면의 조회 요청만 허용합니다.')
    try {
      return Response.json(
        url.pathname.endsWith('/usage')
          ? await usage?.()
          : await query(url.searchParams.get('keyword')),
        {
          headers: securityHeaders,
        },
      )
    } catch {
      return failure(
        503,
        'UNAVAILABLE',
        '검색광고 서버에 연결할 수 없습니다. 자동 재시도하지 않습니다.',
      )
    }
  }
  if (!['GET', 'HEAD'].includes(request.method))
    return failure(405, 'METHOD', '지원하지 않는 요청입니다.')
  const response = await next()
  const result = new Response(response.body, response)
  for (const [name, value] of Object.entries(securityHeaders)) result.headers.set(name, value)
  return result
}
