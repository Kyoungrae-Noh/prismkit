import { limitedBody } from './ai.ts'
import { failure } from './security.ts'
export interface HubRpc {
  hubUsage(): Promise<Response>
  hubQuery(input: unknown): Promise<Response>
}
export async function hubRoute(request: Request, rpc: () => HubRpc) {
  const path = new URL(request.url).pathname
  if (!['/api/hub/status', '/api/hub/query'].includes(path))
    return failure(404, 'NOT_FOUND', '지원하지 않는 HUB 경로')
  if (request.method !== (path.endsWith('/status') ? 'GET' : 'POST'))
    return failure(405, 'METHOD', '요청 방식 오류')
  if (
    request.headers.get('x-prismkit-request') !== 'hub-query' ||
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (request.headers.has('origin') && request.headers.get('origin') !== 'https://prismkit.online')
  )
    return failure(403, 'FORBIDDEN', '관리자 화면 요청만 허용합니다.')
  if (path.endsWith('/status')) return rpc().hubUsage()
  if (request.headers.get('content-type') !== 'application/json')
    return failure(400, 'FORMAT', 'JSON 입력이 필요합니다.')
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 3000)))
  } catch {
    return failure(400, 'FORMAT', '요청 형식 또는 크기 오류')
  }
  return rpc().hubQuery(body)
}
