import { hubApis, hubLabels, type HubRequest, type HubResult } from '../src/providers/hub-types.ts'
import { ApiError } from '../server/searchad/service.ts'
export const hubPaths = {
  blog: '/search/v1/blog',
  cafe: '/search/v1/cafearticle',
  kin: '/search/v1/kin',
  news: '/search/v1/news',
  trend: '/search-trend/v1/search',
  shopping: '/shopping/v1/category/keywords',
} as const
const invalid = () =>
  new ApiError(400, 'INPUT', 'API 종류·검색어·기간·쇼핑 분야 코드를 확인하세요.')
const schema = () =>
  new ApiError(502, 'SCHEMA', 'NAVER 응답 형식이 다릅니다. 자동 재시도하지 않습니다.')
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw schema()
  return v as Record<string, unknown>
}
function text(v: unknown, max = 5000): string {
  if (typeof v !== 'string' || v.length > max) throw schema()
  return v
}
function count(v: unknown) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw schema()
  return v
}
function url(v: unknown): string {
  const s = text(v, 2048)
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error()
  } catch {
    throw schema()
  }
  return s
}
function day(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  )
}
export function validateHubRequest(input: unknown, now = Date.now()): HubRequest {
  let v: Record<string, unknown>
  try {
    v = object(input)
  } catch {
    throw invalid()
  }
  if (
    Object.keys(v).some(
      (k) =>
        ![
          'api',
          'query',
          'sort',
          'startDate',
          'endDate',
          'device',
          'category',
          'groups',
          'shoppingScope',
          'display',
        ].includes(k),
    ) ||
    !hubApis.includes(v.api as HubRequest['api']) ||
    typeof v.query !== 'string' ||
    !v.query.trim() ||
    v.query.length > 100 ||
    /[\u0000-\u001f]/.test(v.query) ||
    (v.display !== undefined &&
      (!Number.isInteger(v.display) ||
        Number(v.display) < 1 ||
        Number(v.display) > 100 ||
        ['trend', 'shopping'].includes(String(v.api)))) ||
    (v.sort !== undefined && !['sim', 'date'].includes(String(v.sort))) ||
    (v.device !== undefined && !['all', 'pc', 'mo'].includes(String(v.device))) ||
    (v.shoppingScope !== undefined && !['category', 'keyword'].includes(String(v.shoppingScope)))
  )
    throw invalid()
  if (
    v.groups !== undefined &&
    (!Array.isArray(v.groups) ||
      v.groups.length < 1 ||
      v.groups.length > 5 ||
      v.groups.some(
        (s) => typeof s !== 'string' || !s.trim() || s.length > 100 || /[\u0000-\u001f]/.test(s),
      ))
  )
    throw invalid()
  if (v.api === 'trend' || v.api === 'shopping') {
    if (
      !day(v.startDate) ||
      !day(v.endDate) ||
      v.startDate > v.endDate ||
      v.startDate < (v.api === 'shopping' ? '2017-08-01' : '2016-01-01') ||
      v.endDate >= new Date(now + 9 * 3600000).toISOString().slice(0, 10) ||
      Date.parse(v.endDate) - Date.parse(v.startDate) > 366 * 86400000
    )
      throw invalid()
    if (v.api === 'shopping' && (typeof v.category !== 'string' || !/^\d{8}$/.test(v.category)))
      throw invalid()
  }
  return {
    api: v.api as HubRequest['api'],
    query: v.query.trim(),
    ...(v.display !== undefined ? { display: Number(v.display) } : {}),
    ...(v.sort !== undefined ? { sort: v.sort as HubRequest['sort'] } : {}),
    ...(v.device !== undefined ? { device: v.device as HubRequest['device'] } : {}),
    ...(v.startDate !== undefined ? { startDate: String(v.startDate) } : {}),
    ...(v.endDate !== undefined ? { endDate: String(v.endDate) } : {}),
    ...(v.category !== undefined ? { category: String(v.category) } : {}),
    ...(v.groups !== undefined ? { groups: v.groups as string[] } : {}),
    ...(v.shoppingScope !== undefined
      ? { shoppingScope: v.shoppingScope as HubRequest['shoppingScope'] }
      : {}),
  }
}
export function hubWireRequest(r: HubRequest) {
  const endpoint = new URL(hubPaths[r.api], 'https://naverapihub.apigw.ntruss.com')
  if (r.api === 'shopping' && r.shoppingScope === 'category')
    endpoint.pathname = '/shopping/v1/categories'
  if (r.api !== 'trend' && r.api !== 'shopping') {
    endpoint.search = new URLSearchParams({
      query: r.query,
      display: String(r.display ?? 10),
      start: '1',
      sort: r.sort ?? 'sim',
      format: 'json',
    }).toString()
    return { url: endpoint.toString(), method: 'GET', body: undefined }
  }
  const groups = r.groups ?? [r.query]
  return {
    url: endpoint.toString(),
    method: 'POST',
    body: JSON.stringify({
      startDate: r.startDate,
      endDate: r.endDate,
      timeUnit: 'date',
      ...(r.device && r.device !== 'all' ? { device: r.device } : {}),
      ...(r.api === 'trend'
        ? { keywordGroups: groups.map((q) => ({ groupName: q, keywords: [q] })) }
        : r.shoppingScope === 'category'
          ? { category: [{ name: r.query, param: [r.category] }] }
          : { category: r.category, keyword: groups.map((q) => ({ name: q, param: [q] })) }),
    }),
  }
}
/** Preserve API order and text. The UI renders text, never untrusted HTML. */
export function normalizeHub(raw: unknown, r: HubRequest, time: string): HubResult {
  const v = object(raw)
  const result: HubResult = {
    api: r.api,
    mode: 'LIVE',
    query: r.query,
    collectedAt: time,
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
    if (
      v.startDate !== r.startDate ||
      v.endDate !== r.endDate ||
      v.timeUnit !== 'date' ||
      !Array.isArray(v.results) ||
      v.results.length > 5
    )
      throw schema()
    result.startDate = r.startDate!
    result.endDate = r.endDate!
    result.unit = r.api === 'trend' ? 'relative-search-index' : 'relative-shopping-click-index'
    result.scope = 'requested-period-only'
    result.series = v.results.map((value) => {
      const s = object(value),
        title = text(s.title, 100)
      if (!(r.groups ?? [r.query]).includes(title) || !Array.isArray(s.data) || s.data.length > 367)
        throw schema()
      const seen = new Set<string>()
      return {
        title,
        points: s.data
          .map((value) => {
            const p = object(value)
            if (
              !day(p.period) ||
              p.period < r.startDate! ||
              p.period > r.endDate! ||
              seen.has(p.period) ||
              typeof p.ratio !== 'number' ||
              !Number.isFinite(p.ratio) ||
              p.ratio < 0 ||
              p.ratio > 100
            )
              throw schema()
            seen.add(p.period)
            return { date: p.period, ratio: p.ratio }
          })
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    })
    if (new Set(result.series.map((s) => s.title)).size !== result.series.length) throw schema()
    return result
  }
  result.total = count(v.total)
  if (
    v.start !== 1 ||
    !Array.isArray(v.items) ||
    v.items.length > (r.display ?? 10) ||
    count(v.display) > (r.display ?? 10)
  )
    throw schema()
  result.items = v.items.map((value, i) => {
    const x = object(value)
    let date: string | null = null
    if (r.api === 'blog' && x.postdate) {
      const d = text(x.postdate, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
      if (!day(d)) throw schema()
      date = d
    }
    if (r.api === 'news' && x.pubDate) {
      const d = Date.parse(text(x.pubDate, 100))
      if (!Number.isFinite(d)) throw schema()
      date = new Date(d).toISOString()
    }
    return {
      title: text(x.title, 500),
      url: url(x.link),
      originalUrl: x.originallink ? url(x.originallink) : null,
      description: text(x.description),
      date,
      dateKind: date
        ? r.api === 'blog'
          ? ('posted' as const)
          : ('provided' as const)
        : ('unavailable' as const),
      source: text(x.bloggername ?? x.cafename ?? hubLabels[r.api], 500),
      apiPosition: i + 1,
    }
  })
  return result
}
