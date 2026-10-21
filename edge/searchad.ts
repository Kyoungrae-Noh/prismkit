import {
  ApiError,
  keywordInput,
  normalize,
  sign,
  type Credentials,
} from '../server/searchad/service.ts'
import type { SearchAdResponse } from '../src/providers/searchad-types.ts'
import { currentBudget, budgetUsage, type Budget } from '../server/searchad/budget.ts'
export { emptyBudget, type Budget } from '../server/searchad/budget.ts'
export interface CacheEntry {
  expires: number
  data: SearchAdResponse
}
export interface BudgetStore {
  read(): Budget
  write(value: Budget): void
  cached(key: string): CacheEntry | undefined
  cache(key: string, value: CacheEntry): void
}
export async function boundedJson(response: Response, limit = 1024 * 1024): Promise<unknown> {
  if (!response.body) throw new ApiError(502, 'INVALID_RESPONSE', '검색광고 응답이 비어 있습니다.')
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > limit)
        throw new ApiError(502, 'INVALID_RESPONSE', '검색광고 응답 크기 제한을 초과했습니다.')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const all = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(all))
  } catch {
    throw new ApiError(502, 'INVALID_RESPONSE', '검색광고 응답 형식을 확인할 수 없습니다.')
  }
}
export async function querySearchAd(
  input: unknown,
  auth: Credentials,
  store: BudgetStore,
  fetcher: typeof fetch = fetch,
  now = Date.now,
): Promise<SearchAdResponse> {
  const keyword = keywordInput(input),
    time = now(),
    state = currentBudget(store.read(), time)
  store.write(state)
  if (state.blocked)
    throw new ApiError(
      429,
      'RATE_LIMIT',
      '인증 실패 또는 429 이후 운영 조회가 차단되었습니다. 관리자 점검이 필요합니다.',
    )
  const hit = store.cached(keyword)
  if (hit && hit.expires > time)
    return { ...hit.data, cached: true, usage: budgetUsage(state, time) }
  if (
    state.calls >= budgetUsage(state, time).limit ||
    state.busyUntil > time ||
    (state.last > 0 && time - state.last < 10000)
  )
    throw new ApiError(
      429,
      'RATE_LIMIT',
      '운영 호출 제한입니다. 최소 10초 간격, 한국시간 일일 예산이 적용됩니다.',
    )
  if (!auth.key || !auth.secret || !auth.customer)
    throw new ApiError(503, 'NOT_CONNECTED', '서버 인증 설정이 필요합니다.')
  // Synchronous durable writes reserve the slot before any external I/O.
  store.write({ ...state, calls: state.calls + 1, last: time, busyUntil: time + 15000 })
  try {
    const url = new URL('https://api.searchad.naver.com/keywordstool')
    url.searchParams.set('hintKeywords', keyword)
    url.searchParams.set('showDetail', '1')
    const response = await fetcher(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        'X-Timestamp': String(time),
        'X-API-KEY': auth.key,
        'X-Customer': auth.customer,
        'X-Signature': sign(String(time), auth.secret),
      },
    })
    if ([401, 403, 429].includes(response.status)) {
      store.write({ ...store.read(), blocked: true })
      await response.body?.cancel()
      throw new ApiError(
        response.status,
        response.status === 429 ? 'RATE_LIMIT' : 'AUTH',
        '검색광고 인증 또는 호출 제한으로 중단했습니다. 자동 재시도하지 않습니다.',
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new ApiError(502, 'UPSTREAM', '검색광고 요청에 실패했습니다. 자동 재시도하지 않습니다.')
    }
    const data = normalize(await boundedJson(response), keyword, new Date(now()).toISOString())
    if (new TextEncoder().encode(JSON.stringify(data)).length > 1024 * 1024)
      throw new ApiError(
        502,
        'INVALID_RESPONSE',
        '정규화된 검색광고 자료가 용량 제한을 초과했습니다.',
      )
    store.cache(keyword, { data, expires: now() + 300000 })
    return { ...data, usage: budgetUsage(store.read(), now()) }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'NETWORK', '검색광고 연결에 실패했습니다. 자동 재시도하지 않습니다.')
  } finally {
    const current = store.read()
    if (current.calls === state.calls + 1 && current.last === time)
      store.write({ ...current, busyUntil: 0 })
  }
}
