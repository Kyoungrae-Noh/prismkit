import { hubApis, type HubRequest, type HubResult, type HubStatus } from './hub-types'
async function request(path: string, input?: HubRequest): Promise<unknown> {
  let response: Response, body: { error?: { message?: string } }
  try {
    response = await fetch(`/api/hub/${path}`, {
      method: input ? 'POST' : 'GET',
      headers: {
        'X-Prismkit-Request': 'hub-query',
        ...(input ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    body = await response.json()
  } catch {
    throw Error(
      'HUB 연결을 확인하지 못했습니다. 관리자 로그인과 서버 연결을 확인하세요. 자동 재시도하지 않습니다.',
    )
  }
  if (!response.ok) throw Error(body.error?.message || `HUB 요청 실패 (${response.status})`)
  return body
}
export async function fetchHubStatus(): Promise<HubStatus> {
  const v = (await request('status')) as HubStatus
  if (
    typeof v.configured !== 'boolean' ||
    !Array.isArray(v.apis) ||
    v.apis.length !== 6 ||
    v.apis.some(
      (a) =>
        !hubApis.includes(a.api) || typeof a.enabled !== 'boolean' || typeof a.reason !== 'string',
    ) ||
    !v.limits
  )
    throw Error('HUB 상태 응답 형식 오류')
  return v
}
export async function requestHub(input: HubRequest): Promise<HubResult> {
  const v = (await request('query', input)) as HubResult
  if (
    v.api !== input.api ||
    v.query !== input.query ||
    v.mode !== 'LIVE' ||
    !Array.isArray(v.items) ||
    !Array.isArray(v.series) ||
    !Number.isFinite(Date.parse(v.collectedAt)) ||
    !['api-results', 'relative-search-index', 'relative-shopping-click-index'].includes(v.unit)
  )
    throw Error('HUB 조회 응답 형식 오류')
  return v
}
/** Explicit local demonstration only. No fetch and no real source URLs or claims. */
export async function demoHub(r: HubRequest): Promise<HubResult> {
  const base: HubResult = {
    api: r.api,
    mode: 'DEMO',
    query: r.query,
    collectedAt: new Date().toISOString(),
    total: null,
    items: [],
    series: [],
    unit: 'api-results',
    scope: 'api-results-only',
    startDate: null,
    endDate: null,
    device: r.device ?? 'all',
    cached: false,
  }
  if (r.api === 'trend' || r.api === 'shopping') {
    const start = r.startDate ?? '2026-10-01'
    return {
      ...base,
      unit: r.api === 'trend' ? 'relative-search-index' : 'relative-shopping-click-index',
      scope: 'requested-period-only',
      startDate: start,
      endDate: r.endDate ?? start,
      series: [
        {
          title: r.query,
          points: Array.from({ length: 14 }, (_, i) => ({
            date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
            ratio: 30 + i * 4,
          })),
        },
      ],
    }
  }
  return {
    ...base,
    total: r.api === 'blog' ? 420 : r.api === 'cafe' ? 180 : 2,
    items: [0, 1].map((i) => ({
      title: `${r.query} 신청 방법${i ? ' 알려주세요' : ''}`,
      url: `https://example.invalid/demo/${r.api}/${i}`,
      originalUrl: null,
      description: '직접 작성한 테스트 문장입니다. 실제 질문·기사가 아닙니다.',
      date: null,
      dateKind: 'unavailable',
      source: 'DEMO 모의 자료',
      apiPosition: i + 1,
    })),
  }
}
