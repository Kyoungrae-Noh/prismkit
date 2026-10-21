import { disconnectedStatus } from '../src/domain/ai-contract.ts'
import { limitedBody } from './ai.ts'
import { failure, securityHeaders } from './security.ts'
import { ApiError } from '../server/searchad/service.ts'
export interface AIRpc {
  aiUsage(): Promise<Response>
  aiExtract(blob: Blob, id: string, retry: boolean): Promise<Response>
}
// Invoked only AFTER the common Access JWT/host verification.
export async function aiRoute(request: Request, enabled: boolean, rpc: () => AIRpc) {
  const path = new URL(request.url).pathname
  if (!['/api/ai/status', '/api/ai/extract'].includes(path))
    return failure(404, 'NOT_FOUND', '지원하지 않는 AI API입니다.')
  if (request.method !== (path.endsWith('/status') ? 'GET' : 'POST'))
    return failure(405, 'METHOD', '지원하지 않는 AI 요청 방식입니다.')
  if (
    request.headers.get('x-prismkit-request') !== 'capture-ai' ||
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (request.headers.has('origin') && request.headers.get('origin') !== 'https://prismkit.online')
  )
    return failure(403, 'FORBIDDEN', 'Prismkit 관리자 화면 요청만 허용합니다.')
  if (!enabled)
    return path.endsWith('/status')
      ? Response.json(disconnectedStatus(), { headers: securityHeaders })
      : failure(503, 'DISABLED', disconnectedStatus().message)
  try {
    if (path.endsWith('/status')) return await rpc().aiUsage()
    const type = request.headers.get('content-type') ?? '',
      id = request.headers.get('x-image-id') ?? ''
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type) || !/^[a-f0-9]{64}$/.test(id))
      return failure(400, 'FORMAT', '이미지 형식 또는 ID 오류')
    if (Number(request.headers.get('content-length')) > 4 * 1024 * 1024)
      return failure(413, 'SIZE', '파일당 4 MiB 제한입니다.')
    const bytes = await limitedBody(request, 4 * 1024 * 1024)
    return await rpc().aiExtract(
      new Blob([bytes], { type }),
      id,
      request.headers.get('x-ai-retry') === 'true',
    )
  } catch (e) {
    return e instanceof ApiError
      ? failure(e.status, e.code, e.message)
      : failure(503, 'UNAVAILABLE', 'AI 서버 연결 실패입니다. 관리자 설정을 확인하세요.')
  }
}
