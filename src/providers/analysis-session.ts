import { analysisHub, analysisVolume } from './analysis-client'
import type { Usage } from '../../server/searchad/budget'
import type { HubRequest, HubStatus } from './hub-types'
import type { SearchAdResponse } from './searchad-types'
export class DeferredAnalysis extends Error {
  readonly deferred = true
}
export interface RemainingBudget {
  searchad: number
  hub: Record<string, number>
  message: string
}
/** This queue follows the existing server ceilings. The server remains the final atomic authority. */
export function analysisSession(
  usage: Usage,
  status: HubStatus,
  signal: AbortSignal,
  notify: (budget: RemainingBudget) => void,
  deps = {
    volume: analysisVolume,
    hub: analysisHub,
    now: Date.now,
    wait: (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(new DeferredAnalysis('사용자가 분석을 중단했습니다.'))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolve()
        }, ms)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      }),
  },
) {
  const remaining: RemainingBudget = { searchad: usage.remaining, hub: {}, message: '' }
  const last: Record<string, number> = { searchad: Date.parse(usage.lastQueryAt ?? '') || 0 }
  for (const a of status.apis) {
    remaining.hub[a.api] =
      status.configured && a.enabled && !a.blocked
        ? Math.max(
            0,
            Math.min(status.limits.daily - a.dailyUsed, status.limits.monthly - a.monthlyUsed),
          )
        : 0
    last[a.api] = deps.now() // status has no last-call timestamp: wait one interval conservatively.
  }
  if (usage.blocked) remaining.searchad = 0
  let halted = false
  const report = (message: string) => {
    remaining.message = message
    notify(structuredClone(remaining))
  }
  async function reserve(api: string) {
    if (signal.aborted || halted) throw new DeferredAnalysis('분석 중단: 남은 후보는 보존됩니다.')
    if (Date.parse(usage.resetsAt) <= deps.now())
      throw new DeferredAnalysis('예산 기준일이 변경됐습니다. 다시 실행해 예산을 확인하세요.')
    const left = api === 'searchad' ? remaining.searchad : remaining.hub[api]
    if (!left)
      throw new DeferredAnalysis(
        `${api === 'searchad' ? '검색광고' : api} 예산 부족 또는 차단: 미조회 후보 보존`,
      )
    const wait = Math.max(
      0,
      (last[api] ?? 0) + (api === 'searchad' ? 10100 : status.limits.intervalMs + 100) - deps.now(),
    )
    if (wait) {
      report(`${api} 호출 간격 대기 ${Math.ceil(wait / 1000)}초`)
      await deps.wait(wait, signal)
    }
    if (signal.aborted || halted) throw new DeferredAnalysis('분석 중단: 남은 후보는 보존됩니다.')
    last[api] = deps.now()
    if (api === 'searchad') remaining.searchad--
    else remaining.hub[api]--
    report(`${api} 조회 중`)
  }
  report('예산 확인 완료')
  return {
    remaining,
    async volume(keyword: string): Promise<SearchAdResponse> {
      const hit = deps.volume.peek(keyword)
      if (hit) return hit
      await reserve('searchad')
      try {
        const result = await deps.volume(keyword)
        if (result.usage) remaining.searchad = result.usage.blocked ? 0 : result.usage.remaining
        else if (result.cached) remaining.searchad++
        // Related rows are measured values for their own exact keyword, never a substitute.
        for (const row of result.rows.slice(0, 30))
          deps.volume.prime(row.keyword, {
            ...result,
            volume: {
              ...result.volume,
              data: { period: 'recent-30-days', pc: row.pc, mobile: row.mobile, total: row.total },
            },
          })
        report('검색광고 조회 완료')
        return result
      } catch (e) {
        halted = true
        throw e
      }
    },
    async hub(request: HubRequest) {
      const hit = deps.hub.peek(request)
      if (hit) return hit
      await reserve(request.api)
      try {
        const result = await deps.hub(request)
        if (result.cached) remaining.hub[request.api]++
        report(`${request.api} 조회 완료`)
        return result
      } catch (e) {
        halted = true
        throw e
      }
    },
  }
}
