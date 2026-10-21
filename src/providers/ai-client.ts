import {
  validateResult,
  type AIStatus,
  AI_MODEL,
  AI_PROVIDER,
  AI_RESERVE_USD,
} from '../domain/ai-contract'
export class AIClientError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
async function request(path: string, init: RequestInit, fetcher: typeof fetch) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 70000)
  try {
    const r = await fetcher(path, {
      ...init,
      signal: controller.signal,
      credentials: 'same-origin',
      redirect: 'error',
    })
    if (r.status === 401 || r.status === 403)
      throw new AIClientError('AUTH', '관리자 인증이 필요합니다. 로그인 후 다시 시도하세요.')
    if (!r.headers.get('content-type')?.includes('application/json'))
      throw new AIClientError(
        'FORMAT',
        'AI 응답 형식 오류입니다. 로그인 상태와 서버 설정을 확인하세요.',
      )
    const data = await r.json()
    if (!r.ok) {
      const code = typeof data?.error?.code === 'string' ? data.error.code : 'SERVER'
      const messages: Record<string, string> = {
        DISABLED: 'AI 판독 미연결: 인증정보와 비용 승인이 필요합니다.',
        BUDGET: 'AI 호출·비용 한도 초과입니다.',
        INTERVAL: '처리 중이거나 최소 10초 호출 간격입니다. 잠시 후 재시도하세요.',
        DUPLICATE: '오늘 처리한 이미지입니다. 기존 결과를 확인하세요.',
        TIMEOUT: 'AI 응답 시간 초과입니다. 자동 재시도하지 않습니다.',
        PROVIDER_BLOCKED: 'AI 제공업체 인증·호출 제한으로 차단됐습니다. 관리자 점검이 필요합니다.',
        BLOCKED: 'AI 제공업체 차단 상태입니다.',
        FORMAT: 'AI 응답 또는 이미지 형식 오류입니다.',
        SIZE: 'AI 이미지 크기 제한 초과입니다.',
      }
      throw new AIClientError(code, messages[code] ?? 'AI 서버 판독 실패입니다. 원본은 보존됩니다.')
    }
    return data
  } catch (e) {
    if (e instanceof AIClientError) throw e
    throw new AIClientError(
      controller.signal.aborted ? 'TIMEOUT' : 'NETWORK',
      controller.signal.aborted
        ? 'AI 응답 시간 초과입니다. 직접 재시도하세요.'
        : 'AI 네트워크 연결 또는 응답 오류입니다. 직접 재시도하세요.',
    )
  } finally {
    clearTimeout(timer)
  }
}
export async function fetchAIStatus(fetcher: typeof fetch = fetch): Promise<AIStatus> {
  const s = await request(
    '/api/ai/status',
    { headers: { 'X-Prismkit-Request': 'capture-ai' } },
    fetcher,
  )
  if (
    typeof s.connected !== 'boolean' ||
    s.model !== AI_MODEL ||
    s.provider !== AI_PROVIDER ||
    typeof s.blocked !== 'boolean' ||
    s.perImageUsd !== AI_RESERVE_USD ||
    typeof s.message !== 'string' ||
    s.message.length > 500 ||
    ![s.used, s.remaining].every(
      (n) => n === null || (Number.isSafeInteger(n) && n >= 0 && n <= 30),
    ) ||
    !(
      s.reservedUsd === null ||
      (typeof s.reservedUsd === 'number' && s.reservedUsd >= 0 && s.reservedUsd <= 0.6)
    ) ||
    !(
      s.resetsAt === null ||
      (typeof s.resetsAt === 'string' && Number.isFinite(Date.parse(s.resetsAt)))
    ) ||
    (s.connected && [s.used, s.remaining, s.reservedUsd, s.resetsAt].some((v) => v === null))
  )
    throw new AIClientError('FORMAT', 'AI 상태 응답 형식 오류입니다.')
  return s
}
export async function extractImage(
  id: string,
  blob: Blob,
  retry = false,
  fetcher: typeof fetch = fetch,
) {
  const raw = await request(
    '/api/ai/extract',
    {
      method: 'POST',
      headers: {
        'X-Prismkit-Request': 'capture-ai',
        'X-Image-Id': id,
        'X-AI-Retry': String(retry),
        'Content-Type': blob.type,
      },
      body: blob,
    },
    fetcher,
  )
  try {
    return validateResult(raw, id)
  } catch {
    throw new AIClientError('FORMAT', 'AI 결과 스키마 또는 원본 연결 오류입니다.')
  }
}
