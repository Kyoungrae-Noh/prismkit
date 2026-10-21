import { workspaceStorage, type StoragePort } from './storage'
import type { DiscoveryAnalysis, DiscoveryCandidate } from '../domain/discovery'
import type { Metrics } from '../domain/dual-analysis'
import { normalizeKeyword } from '../domain/candidates'
export const DISCOVERY_KEY = 'prismkit.discovery.v1'
export interface DiscoveryWorkspace {
  version: 1
  rows: DiscoveryCandidate[]
  metrics: Metrics
  analyses: Record<string, DiscoveryAnalysis>
  settings?: {
    custom: string
    interests: string[]
    target: string
    mode: 'LIVE' | 'DEMO'
    category: string
    device: 'all' | 'pc' | 'mo'
    dates: { startDate: string; endDate: string }
  }
}
export const emptyDiscovery = (): DiscoveryWorkspace => ({
  version: 1,
  rows: [],
  metrics: {},
  analyses: {},
})
function fail(): never {
  throw Error('발굴 분석 저장 자료 형식 오류입니다. 기존 자료는 보존되었습니다.')
}
function fields(v: unknown, keys: string) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.split(' ').includes(k))
  )
    fail()
}
const str = (v: unknown, max = 2000) => {
  if (typeof v !== 'string' || v.length > max) fail()
}
const date = (v: unknown, nullable = false) => {
  if (nullable && v === null) return
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) fail()
}
const count = (v: unknown) => {
  if (v !== null && v !== '<10' && !(typeof v === 'number' && Number.isSafeInteger(v) && v >= 0))
    fail()
}
const list = (v: unknown, max = 2000) => {
  if (!Array.isArray(v) || v.length > max) fail()
}
const url = (v: unknown, empty = false) => {
  if (empty && v === '') return
  str(v, 2000)
  try {
    const u = new URL(v as string)
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) fail()
  } catch {
    fail()
  }
}
export function validateDiscovery(input: unknown): DiscoveryWorkspace {
  const w = input as DiscoveryWorkspace
  fields(w, 'version rows metrics analyses settings')
  if (w.settings) {
    const s = w.settings
    fields(s, 'custom interests target mode category device dates')
    str(s.custom, 200)
    list(s.interests, 6)
    s.interests.forEach((v) => str(v, 30))
    if (
      !/^\d+$/.test(s.target) ||
      Number(s.target) < 1 ||
      Number(s.target) > 100 ||
      !['LIVE', 'DEMO'].includes(s.mode) ||
      !['all', 'pc', 'mo'].includes(s.device)
    )
      fail()
    str(s.category, 8)
    fields(s.dates, 'startDate endDate')
    str(s.dates.startDate, 10)
    str(s.dates.endDate, 10)
  }
  if (w.version !== 1) fail()
  list(w.rows)
  for (const c of w.rows) {
    fields(c, 'key title keyword mode sources occurrences duplicate intent reasons')
    for (const s of [c.key, c.title, c.keyword, c.intent]) str(s)
    if (!c.keyword.trim() || c.key !== `${c.mode}:${normalizeKeyword(c.keyword)}`) fail()
    if (
      !['LIVE', 'DEMO'].includes(c.mode) ||
      typeof c.duplicate !== 'boolean' ||
      !Number.isSafeInteger(c.occurrences) ||
      c.occurrences < 1
    )
      fail()
    list(c.sources, 1000)
    list(c.reasons, 100)
    c.reasons.forEach((v) => str(v))
    for (const s of c.sources) {
      fields(s, 'api url date collectedAt')
      str(s.api, 30)
      url(s.url, true)
      date(s.date, true)
      date(s.collectedAt)
    }
  }
  if (new Set(w.rows.map((r) => r.key)).size !== w.rows.length) fail()
  for (const entries of [w.metrics, w.analyses]) {
    if (
      !entries ||
      typeof entries !== 'object' ||
      Array.isArray(entries) ||
      Object.keys(entries).length > 4000
    )
      fail()
    for (const [key, a] of Object.entries(entries)) {
      str(key, 300)
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail()
      fields(a, 'keyword states review results volume volumeAt related errors')
      str(a.keyword, 100)
      if (!a.keyword?.trim() || !/^(LIVE|DEMO):/.test(key)) fail()
      date(a.volumeAt, true)
      list(a.related, 30)
      list(a.errors, 30)
      a.related.forEach((v) => str(v, 100))
      a.errors.forEach((v) => str(v))
      if (a.volume !== null) {
        fields(a.volume, 'keyword pc mobile total')
        str(a.volume.keyword, 100)
        if (normalizeKeyword(a.volume.keyword) !== normalizeKeyword(a.keyword)) fail()
        for (const v of [a.volume.pc, a.volume.mobile, a.volume.total]) count(v)
      }
      if (a.states !== undefined) {
        fields(a.states, 'searchad blog cafe trend shopping')
        for (const s of Object.values(a.states)) {
          fields(s, 'state at message cached retained')
          if (!['LIVE 확인', '캐시', '자료 부족', '조회 실패', '미조회'].includes(s.state)) fail()
          date(s.at, true)
          str(s.message)
          for (const b of [s.cached, s.retained])
            if (b !== undefined && typeof b !== 'boolean') fail()
        }
      }
      if (a.review !== undefined) {
        fields(a.review, 'reviewman note official')
        str(a.review.note, 1000)
        if (!['unknown', 'fit', 'unfit'].includes(a.review.reviewman)) fail()
        if (a.review.official !== null) {
          fields(a.review.official, 'url note checkedAt')
          url(a.review.official.url)
          str(a.review.official.note, 1000)
          date(a.review.official.checkedAt)
        }
      }
      list(a.results, 4)
      for (const r of a.results) {
        fields(
          r,
          'api mode query collectedAt total items series unit scope startDate endDate device cached',
        )
        if (!key.startsWith(`${r.mode}:`)) fail()
        if (
          !['blog', 'cafe', 'trend', 'shopping'].includes(r.api) ||
          !['LIVE', 'DEMO'].includes(r.mode) ||
          r.query !== a.keyword ||
          !['all', 'pc', 'mo'].includes(r.device) ||
          typeof r.cached !== 'boolean'
        )
          fail()
        if (
          !['api-results', 'relative-search-index', 'relative-shopping-click-index'].includes(
            r.unit,
          ) ||
          !['api-results-only', 'requested-period-only'].includes(r.scope)
        )
          fail()
        date(r.collectedAt)
        date(r.startDate, true)
        date(r.endDate, true)
        count(r.total)
        if (r.total !== null && typeof r.total !== 'number') fail()
        list(r.items, 100)
        list(r.series, 5)
        for (const i of r.items) {
          fields(i, 'title url originalUrl description date dateKind source apiPosition')
          str(i.title, 500)
          str(i.description, 10000)
          str(i.source, 500)
          url(i.url)
          if (i.originalUrl !== null) url(i.originalUrl)
          date(i.date, true)
          if (
            !['posted', 'provided', 'unavailable'].includes(i.dateKind) ||
            !Number.isInteger(i.apiPosition) ||
            i.apiPosition < 1 ||
            i.apiPosition > 100
          )
            fail()
        }
        for (const s of r.series) {
          fields(s, 'title points')
          str(s.title, 100)
          list(s.points, 367)
          for (const p of s.points) {
            fields(p, 'date ratio')
            date(p.date)
            if (
              typeof p.ratio !== 'number' ||
              !Number.isFinite(p.ratio) ||
              p.ratio < 0 ||
              p.ratio > 100
            )
              fail()
          }
        }
      }
    }
  }
  return w
}
export function createDiscoveryStore(storage: StoragePort) {
  const port = workspaceStorage(storage)
  let expected = port.getItem(DISCOVERY_KEY)
  return {
    read() {
      expected = port.getItem(DISCOVERY_KEY)
      return expected === null ? emptyDiscovery() : validateDiscovery(JSON.parse(expected))
    },
    save(value: DiscoveryWorkspace) {
      if (port.getItem(DISCOVERY_KEY) !== expected)
        throw Error('다른 탭에서 발굴 자료가 변경되었습니다. 새로고침 후 다시 확인하세요.')
      const raw = JSON.stringify(validateDiscovery(value))
      if (raw.length > 5 * 1024 * 1024)
        throw Error('발굴 자료 저장 한도에 도달했습니다. 기존 자료는 보존됩니다.')
      port.setItem(DISCOVERY_KEY, raw)
      expected = raw
    },
  }
}
