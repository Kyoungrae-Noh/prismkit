import { budgetUsage, kstDay, DAILY_LIMIT } from './budget.ts'
import { createHmac } from 'node:crypto'
import type { SearchAdResponse, SearchAdRow } from '../../src/providers/searchad-types.ts'
import type { Count } from '../../src/domain/research.ts'
export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
export interface Credentials {
  key: string
  secret: string
  customer: string
}
export function credentials(env: NodeJS.ProcessEnv): Credentials {
  const key = env.NAVER_SEARCHAD_API_KEY?.trim(),
    secret = env.NAVER_SEARCHAD_SECRET_KEY?.trim(),
    customer = env.NAVER_SEARCHAD_CUSTOMER_ID?.trim()
  if (!key || !secret || !customer)
    throw new ApiError(503, 'NOT_CONNECTED', '서버의 검색광고 인증 설정이 필요합니다.')
  return { key, secret, customer }
}
export function sign(timestamp: string, secret: string) {
  return createHmac('sha256', secret).update(`${timestamp}.GET./keywordstool`).digest('base64')
}
export function keywordInput(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 60 ||
    /[,\r\n\x00-\x1f]/.test(value)
  )
    throw new ApiError(400, 'INVALID_INPUT', '키워드 하나를 1~60자로 입력하세요.')
  return value.trim().replace(/\s+/g, '')
}
function count(value: unknown): Count {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string' && /^<\s*10$/.test(value)) return '<10'
  if (
    (typeof value === 'number' || typeof value === 'string') &&
    /^\d+$/.test(String(value)) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) <= Number.MAX_SAFE_INTEGER / 2
  )
    return Number(value)
  throw new ApiError(502, 'INVALID_RESPONSE', '검색광고 응답의 검색량 형식을 확인할 수 없습니다.')
}
export function normalize(raw: unknown, keyword: string, at: string): SearchAdResponse {
  const payload = raw as { keywordList?: unknown }
  if (!payload || !Array.isArray(payload.keywordList) || payload.keywordList.length > 20000)
    throw new ApiError(502, 'INVALID_RESPONSE', '검색광고 응답 형식이 올바르지 않습니다.')
  const rows: SearchAdRow[] = payload.keywordList.map((item: unknown) => {
    if (!item || typeof item !== 'object')
      throw new ApiError(502, 'INVALID_RESPONSE', '키워드 자료 형식이 올바르지 않습니다.')
    const row = item as Record<string, unknown>
    if (typeof row.relKeyword !== 'string' || !row.relKeyword.trim() || row.relKeyword.length > 200)
      throw new ApiError(502, 'INVALID_RESPONSE', '키워드 자료 형식이 올바르지 않습니다.')
    const pc = count(row.monthlyPcQcCnt),
      mobile = count(row.monthlyMobileQcCnt)
    return {
      keyword: row.relKeyword,
      pc,
      mobile,
      total: typeof pc === 'number' && typeof mobile === 'number' ? pc + mobile : null,
    }
  })
  const exact = rows.find((row) => row.keyword.replace(/\s+/g, '') === keyword)
  const source = { id: 'searchad', label: '네이버 검색광고 키워드 도구', mode: 'API' as const }
  const meta = {
    source,
    collectedAt: at,
    checkedDate: at.slice(0, 10),
    verification: 'VERIFIED' as const,
    error: null,
  }
  return {
    volume: {
      ...meta,
      data: exact
        ? { pc: exact.pc, mobile: exact.mobile, total: exact.total, period: 'recent-30-days' }
        : null,
      missing: exact
        ? [
            ...(exact.pc === null ? ['pc'] : []),
            ...(exact.mobile === null ? ['mobile'] : []),
            ...(exact.total === null ? ['total'] : []),
          ]
        : ['keyword', 'pc', 'mobile', 'total'],
    },
    expansion: {
      ...meta,
      data: {
        keywords: [...new Set(rows.filter((row) => row !== exact).map((row) => row.keyword))],
        kind: 'searchad-related',
      },
      missing: rows.length ? [] : ['related'],
    },
    rows,
    cached: false,
  }
}
export function createService(
  auth: () => Credentials,
  options: { fetcher?: typeof fetch; now?: () => number; maxCalls?: number } = {},
) {
  const fetcher = options.fetcher ?? fetch,
    now = options.now ?? Date.now
  const cache = new Map<string, { expires: number; data: SearchAdResponse }>()
  let calls = 0,
    last = -Infinity,
    busy = false,
    blocked = false,
    day = kstDay(now())
  const usage = () => {
    const current = kstDay(now())
    if (current > day) {
      calls = 0
      day = current
    }
    return budgetUsage(
      { version: 2, day, calls, last: Number.isFinite(last) ? last : 0, blocked, busyUntil: 0 },
      now(),
    )
  }
  const query = async (input: unknown): Promise<SearchAdResponse> => {
    const keyword = keywordInput(input),
      time = now()
    usage()
    if (blocked)
      throw new ApiError(
        429,
        'RATE_LIMIT',
        '인증 실패 또는 429로 외부 호출을 중단했습니다. 설정 확인 후 서버를 재시작하세요.',
      )
    const hit = cache.get(keyword)
    if (hit && hit.expires > time)
      return { ...structuredClone(hit.data), cached: true, usage: usage() }
    if (
      busy ||
      time - last < 10000 ||
      calls >= Math.min(options.maxCalls ?? DAILY_LIMIT, DAILY_LIMIT)
    )
      throw new ApiError(
        429,
        'RATE_LIMIT',
        '서버 호출 제한입니다. 최소 10초 간격, 한국시간 하루 최대 30회만 조회합니다.',
      )
    const keys = auth()
    busy = true
    calls++
    last = time
    try {
      const url = new URL('https://api.searchad.naver.com/keywordstool')
      url.searchParams.set('hintKeywords', keyword)
      url.searchParams.set('showDetail', '1')
      const timestamp = String(time)
      const response = await fetcher(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': keys.key,
          'X-Customer': keys.customer,
          'X-Signature': sign(timestamp, keys.secret),
        },
      })
      if (response.status === 401 || response.status === 403) {
        blocked = true
        throw new ApiError(
          response.status,
          'AUTH',
          '검색광고 인증에 실패했습니다. 서버 인증 설정을 확인하세요. 자동 재시도하지 않습니다.',
        )
      }
      if (response.status === 429) {
        blocked = true
        throw new ApiError(
          429,
          'RATE_LIMIT',
          '검색광고 호출 제한(429)으로 중단했습니다. 자동 재시도하지 않습니다.',
        )
      }
      if (!response.ok)
        throw new ApiError(
          response.status,
          'UPSTREAM',
          '검색광고 요청에 실패했습니다. 자동 재시도하지 않습니다.',
        )
      // Do not log or forward upstream errors or credentials.
      let raw: unknown
      try {
        raw = await response.json()
      } catch {
        throw new ApiError(502, 'INVALID_RESPONSE', '검색광고 JSON 응답을 읽지 못했습니다.')
      }
      const data = normalize(raw, keyword, new Date(now()).toISOString())
      cache.set(keyword, { expires: now() + 300000, data: structuredClone(data) })
      return { ...data, usage: usage() }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(
        502,
        'NETWORK',
        '검색광고 연결에 실패하거나 제한 시간을 초과했습니다. 자동 재시도하지 않습니다.',
      )
    } finally {
      busy = false
    }
  }
  return Object.assign(query, { usage })
}
