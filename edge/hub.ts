import { hubApis, type HubApi, type HubResult, type HubStatus } from '../src/providers/hub-types.ts'
import { hubWireRequest, normalizeHub, validateHubRequest } from './hub-contract.ts'
import { boundedJson } from './searchad.ts'
import { ApiError } from '../server/searchad/service.ts'
export interface HubSettings {
  NAVER_API_HUB_CLIENT_ID?: string
  NAVER_API_HUB_CLIENT_SECRET?: string
}
export const hubLimits = { daily: 30, monthly: 300, intervalMs: 1000, cacheSeconds: 300 } as const
// Deliberate deployment gate, not a browser toggle or an environment-only override.
// See docs/PHASE3I_API_REVIEW.md. Search-derived storage/AI/monetization is restricted;
// Data Lab's applicable storage/commercial terms have not been established.
export const hubPolicy: Record<HubApi, { enabled: boolean; reason: string }> = Object.fromEntries(
  hubApis.map((api) => [
    api,
    {
      enabled: false,
      reason:
        api === 'trend' || api === 'shopping'
          ? 'Data Lab 저장·상업적 활용 조건 확인 필요'
          : '검색 결과 저장·가공·AI·수익화 활용에 대한 NAVER 별도 허가 필요',
    },
  ]),
) as Record<HubApi, { enabled: boolean; reason: string }>
export interface HubBudget {
  day: string
  month: string
  daily: number
  monthly: number
  last: number
  busyUntil: number
  blocked: 'AUTH' | 'RATE_LIMIT' | null
}
export interface HubCache {
  key: string
  expires: number
  result: HubResult
}
export interface HubStore {
  read(api: HubApi): HubBudget | null
  write(api: HubApi, v: HubBudget): void
  cached(api: HubApi): HubCache | null
  cache(api: HubApi, value: HubCache | null): void
}
function budget(s: HubStore, api: HubApi, now: number): HubBudget {
  const date = new Date(now + 9 * 3600000).toISOString(),
    day = date.slice(0, 10),
    month = date.slice(0, 7)
  const previous = s.read(api)
  if (
    previous &&
    (typeof previous.day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(previous.day) ||
      previous.month !== previous.day.slice(0, 7) ||
      ![null, 'AUTH', 'RATE_LIMIT'].includes(previous.blocked) ||
      !Number.isSafeInteger(previous.daily) ||
      previous.daily < 0 ||
      !Number.isSafeInteger(previous.monthly) ||
      previous.monthly < 0 ||
      !Number.isFinite(previous.last) ||
      previous.last < 0 ||
      !Number.isFinite(previous.busyUntil) ||
      previous.busyUntil < 0)
  )
    throw new ApiError(503, 'STATE', '호출 예산 자료 확인 필요')
  return {
    day,
    month,
    daily: previous?.day === day ? previous.daily : 0,
    monthly: previous?.month === month ? previous.monthly : 0,
    last: previous?.last ?? 0,
    busyUntil: previous?.busyUntil ?? 0,
    blocked:
      previous?.blocked === 'AUTH' ? 'AUTH' : previous?.day === day ? previous.blocked : null,
  }
}
export function hubStatus(settings: HubSettings, store: HubStore, now = Date.now()): HubStatus {
  return {
    configured: !!(settings.NAVER_API_HUB_CLIENT_ID && settings.NAVER_API_HUB_CLIENT_SECRET),
    limits: hubLimits,
    apis: hubApis.map((api) => {
      const b = budget(store, api, now)
      return {
        api,
        ...hubPolicy[api],
        dailyUsed: b.daily,
        monthlyUsed: b.monthly,
        blocked: b.blocked !== null,
      }
    }),
  }
}
export async function queryHub(
  input: unknown,
  settings: HubSettings,
  store: HubStore,
  fetcher: typeof fetch = fetch,
  now = () => Date.now(),
  policy = hubPolicy,
): Promise<HubResult> {
  const r = validateHubRequest(input, now()),
    gate = policy[r.api]
  if (!gate.enabled) throw new ApiError(403, 'POLICY_HOLD', gate.reason)
  if (!settings.NAVER_API_HUB_CLIENT_ID || !settings.NAVER_API_HUB_CLIENT_SECRET)
    throw new ApiError(503, 'CONFIG', 'NAVER API HUB 서버 인증정보 미등록')
  const key = JSON.stringify(hubWireRequest(r)),
    time = now(),
    b = budget(store, r.api, time)
  if (b.blocked)
    throw new ApiError(
      429,
      b.blocked,
      '인증 실패 또는 호출 제한으로 중단되었습니다. 자동 재시도하지 않습니다.',
    )
  const cached = store.cached(r.api)
  if (cached?.key === key && cached.expires > time) return { ...cached.result, cached: true }
  // Keep at most the latest query for each API; a new query invalidates its predecessor.
  store.cache(r.api, null)
  if (b.busyUntil > time) throw new ApiError(409, 'BUSY', '같은 API의 조회가 진행 중입니다.')
  if (b.last && time - b.last < hubLimits.intervalMs)
    throw new ApiError(429, 'INTERVAL', '최소 호출 간격을 기다린 후 직접 조회하세요.')
  if (b.daily >= hubLimits.daily || b.monthly >= hubLimits.monthly)
    throw new ApiError(429, 'BUDGET', 'API별 일 30회·월 300회 내부 한도에 도달했습니다.')
  b.daily++
  b.monthly++
  b.last = time
  b.busyUntil = time + 20000
  store.write(r.api, b) // Reserve before the first await; failures consume an attempt.
  try {
    const wire = hubWireRequest(r)
    const response = await fetcher(wire.url, {
      method: wire.method,
      body: wire.body,
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: {
        'X-NCP-APIGW-API-KEY-ID': settings.NAVER_API_HUB_CLIENT_ID,
        'X-NCP-APIGW-API-KEY': settings.NAVER_API_HUB_CLIENT_SECRET,
        ...(wire.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    if ([401, 403, 429].includes(response.status)) {
      b.blocked = response.status === 429 ? 'RATE_LIMIT' : 'AUTH'
      throw new ApiError(
        response.status,
        b.blocked,
        'NAVER 인증·권한 또는 한도 오류로 이 API를 차단했습니다. 자동 재시도하지 않습니다.',
      )
    }
    if (!response.ok)
      throw new ApiError(
        502,
        'UPSTREAM',
        `NAVER 응답 오류 (HTTP ${response.status}). 자동 재시도하지 않습니다.`,
      )
    const result = normalizeHub(
      await boundedJson(response, 128 * 1024),
      r,
      new Date(now()).toISOString(),
    )
    store.cache(r.api, { key, result, expires: now() + hubLimits.cacheSeconds * 1000 })
    return result
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(
      502,
      'UNAVAILABLE',
      'NAVER 연결·시간 초과 오류입니다. 자동 재시도하지 않습니다.',
    )
  } finally {
    b.busyUntil = 0
    store.write(r.api, b)
  }
}
