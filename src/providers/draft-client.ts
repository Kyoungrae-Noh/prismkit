import { validateManuscripts, type DraftBrief, type DraftStatus } from '../domain/manuscripts'
async function request(path: string, body?: unknown, fetcher: typeof fetch = fetch) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 90000)
  try {
    const r = await fetcher('/api/ai/drafts/' + path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'X-Prismkit-Request': 'draft-ai',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (
      !r.headers.get('content-type')?.includes('application/json') ||
      [401, 403].includes(r.status)
    )
      throw Error('관리자 로그인과 원고 연결 상태를 확인하세요.')
    const v = await r.json()
    if (!r.ok)
      throw Error(
        (
          {
            DISABLED: '원고 예산 승인 전입니다.',
            BUDGET: '원고 일/월 한도 초과',
            INTERVAL: '이미 생성 중이거나 10초 호출 간격입니다.',
            BLOCKED: '제공업체 차단: 관리자 확인 필요',
            DUPLICATE: '이미 요청한 원고입니다. 생성 이력을 확인하세요.',
            TIMEOUT: '원고 생성 시간 초과. 자동 재시도하지 않습니다.',
          } as Record<string, string>
        )[v.error?.code] ?? '원고 요청 실패. 기존 원고와 입력은 보존됩니다.',
      )
    return v
  } catch (e) {
    if (controller.signal.aborted)
      throw Error('원고 생성 시간 초과. 예약량은 유지됩니다. 자동 재시도하지 않습니다.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
export async function fetchDraftStatus(fetcher: typeof fetch = fetch): Promise<DraftStatus> {
  const v = await request('status', undefined, fetcher)
  if (
    typeof v.connected !== 'boolean' ||
    typeof v.blocked !== 'boolean' ||
    ![v.used, v.monthUsed, v.remaining, v.estimatedUsd, v.reservedUsd].every(
      (x) => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0),
    ) ||
    (v.connected && [v.used, v.monthUsed, v.remaining].some((x) => x === null))
  )
    throw Error('원고 사용량 응답 오류')
  return v
}
export async function requestDraft(brief: DraftBrief, id: string, fetcher: typeof fetch = fetch) {
  const v = await request('generate', { brief, id }, fetcher)
  const m = validateManuscripts([v])[0]
  if (m.id !== id || JSON.stringify(m.brief) !== JSON.stringify(brief))
    throw Error('원고 연결 정보 불일치')
  return m
}
