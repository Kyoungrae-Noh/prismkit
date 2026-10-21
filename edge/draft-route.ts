import { limitedBody } from './ai.ts'
import { failure, securityHeaders } from './security.ts'
import type { DraftBrief } from '../src/domain/manuscripts.ts'
export interface DraftRpc {
  draftUsage(): Promise<Response>
  draftGenerate(brief: DraftBrief, id: string): Promise<Response>
}
export async function draftRoute(request: Request, rpc: () => DraftRpc) {
  const path = new URL(request.url).pathname
  if (!['/api/ai/drafts/status', '/api/ai/drafts/generate'].includes(path))
    return failure(404, 'NOT_FOUND', '지원하지 않는 원고 API')
  if (request.method !== (path.endsWith('/status') ? 'GET' : 'POST'))
    return failure(405, 'METHOD', '요청 방식 오류')
  if (
    request.headers.get('x-prismkit-request') !== 'draft-ai' ||
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (request.headers.has('origin') && request.headers.get('origin') !== 'https://prismkit.online')
  )
    return failure(403, 'FORBIDDEN', '관리자 화면 요청만 허용합니다.')
  try {
    if (path.endsWith('/status')) return await rpc().draftUsage()
    if (request.headers.get('content-type') !== 'application/json')
      return failure(400, 'FORMAT', 'JSON 입력이 필요합니다.')
    const raw = JSON.parse(new TextDecoder().decode(await limitedBody(request, 17000)))
    if (!raw || Object.keys(raw).sort().join() !== 'brief,id')
      return failure(400, 'FORMAT', '원고 요청 형식 오류')
    const response = await rpc().draftGenerate(raw.brief, raw.id)
    if (!response.ok || request.headers.get('x-prismkit-draft-format') === '2') return response
    // Tabs opened before Phase 3E-2 reject unknown content keys. Keep that response contract.
    const legacy = (await response.json()) as {
      content?: Record<string, unknown>
      generated?: Record<string, unknown>
    }
    if (legacy.content) delete legacy.content.comparison
    if (legacy.generated) delete legacy.generated.comparison
    return Response.json(legacy, { status: response.status, headers: securityHeaders })
  } catch {
    return Response.json(
      { error: { code: 'FORMAT', message: '원고 요청 또는 서버 연결 오류입니다.' } },
      { status: 503, headers: securityHeaders },
    )
  }
}
