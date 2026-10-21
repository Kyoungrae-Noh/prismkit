import { IntegratedDetail } from './integrated-detail'
import {
  dualKeywords,
  metricKey,
  metricFor,
  quickPlan,
  sortDiscovery,
  dualSorts,
  demandRatio,
  type DualSort,
} from '../domain/dual-analysis'
import { MetricValue, DualMetrics } from './dual-metrics'
import {
  createDiscoveryStore,
  emptyDiscovery,
  type DiscoveryWorkspace,
} from '../data/discovery-store'
import { analysisSession, type RemainingBudget } from '../providers/analysis-session'
import { analysisHub, analysisVolume } from '../providers/analysis-client'
import { readBudget } from '../providers/usage-client'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { createCandidateStore } from '../data/candidate-store'
import { createPublishingStore } from '../data/publishing-store'
import { normalizeKeyword } from '../domain/candidates'
import {
  analyzeDiscovery,
  collectDiscovery,
  discoverySeeds,
  discoveryToCandidate,
  discoveryRecommendation,
  groupDiscovery,
  type DiscoveryAnalysis,
  type DiscoveryCandidate,
} from '../domain/discovery'
import { demoHub, fetchHubStatus } from '../providers/hub-client'
import { hubLabels, type HubStatus } from '../providers/hub-types'
import type { SearchAdResponse } from '../providers/searchad-types'
const interests = ['경제·금융', '생활정보', 'IT·디지털', '여행', '쇼핑', '부동산']
function period() {
  const yesterday = Date.now() + 9 * 3600000 - 86400000
  return {
    startDate: new Date(yesterday - 29 * 86400000).toISOString().slice(0, 10),
    endDate: new Date(yesterday).toISOString().slice(0, 10),
  }
}
function demoVolume(keyword: string): Promise<SearchAdResponse> {
  const result = {
    source: { id: 'demo', label: 'DEMO 모의 검색량', mode: 'DEMO' as const },
    collectedAt: new Date().toISOString(),
    checkedDate: null,
    verification: 'UNVERIFIED' as const,
    error: null,
    missing: ['실제 검색량 미조회'],
  }
  return Promise.resolve({
    rows: [{ keyword, pc: 1000, mobile: 2200, total: 3200 }],
    cached: false,
    volume: { ...result, data: { pc: 1000, mobile: 2200, total: 3200, period: 'recent-30-days' } },
    expansion: { ...result, data: { keywords: [keyword], kind: 'searchad-related' } },
  })
}
export function DiscoveryPanel() {
  const { ideas } = useWorkspace(),
    navigate = useNavigate()
  const [store] = useState(() => createDiscoveryStore(localStorage))
  const [initial] = useState(() => {
    try {
      return { data: store.read(), error: '' }
    } catch (e) {
      return { data: emptyDiscovery(), error: (e as Error).message }
    }
  })
  const [selected, setSelected] = useState<string[]>(initial.data.settings?.interests ?? []),
    [custom, setCustom] = useState(initial.data.settings?.custom ?? '')
  const [mode, setMode] = useState<'LIVE' | 'DEMO'>(initial.data.settings?.mode ?? 'LIVE'),
    [category, setCategory] = useState(initial.data.settings?.category ?? '')
  const [device, setDevice] = useState<'all' | 'pc' | 'mo'>(initial.data.settings?.device ?? 'all'),
    [dates, setDates] = useState(initial.data.settings?.dates ?? period())
  const [status, setStatus] = useState<HubStatus | null>(null),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState('')
  const [workspace, setWorkspace] = useState(initial.data)
  const dataRef = useRef(workspace)
  const rows = workspace.rows.filter((c) => c.mode === mode),
    analysis = workspace.analyses,
    metrics = workspace.metrics
  const [picked, setPicked] = useState<string[]>([]),
    [target, setTarget] = useState(initial.data.settings?.target ?? '10'),
    [sort, setSort] = useState<DualSort>('recommendation')
  const [remaining, setRemaining] = useState<RemainingBudget | null>(null),
    [progress, setProgress] = useState('')
  const [searchadBudgetKnown, setSearchadBudgetKnown] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  function persist(change: (current: DiscoveryWorkspace) => DiscoveryWorkspace) {
    if (initial.error) throw Error(initial.error)
    const next = change(dataRef.current)
    store.save(next)
    dataRef.current = next
    setWorkspace(next)
  }
  function saveMetric(keyword: string, value: DiscoveryAnalysis) {
    persist((w) => ({ ...w, metrics: { ...w.metrics, [metricKey(mode, keyword)]: value } }))
  }
  const [expanded, setExpanded] = useState(''),
    [min, setMin] = useState(''),
    [max, setMax] = useState(''),
    [hideDuplicates, setHideDuplicates] = useState(false)
  const running = useRef(false)
  const seeds = discoverySeeds([...custom.split(/[,\n]/).filter(Boolean), ...selected], ideas, [])
  async function run(label: string, work: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(label)
    setMessage('')
    try {
      await work()
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      running.current = false
      setBusy('')
    }
  }
  async function check() {
    const s = await fetchHubStatus()
    setStatus(s)
    return s
  }
  async function discover() {
    if (!/^\d+$/.test(target) || Number(target) < 1 || Number(target) > 100)
      throw Error('수집 개수는 1~100개로 입력하세요.')
    if (!seeds.length) throw Error('관심 분야를 선택하거나 관심 주제를 입력하세요.')
    if (mode === 'LIVE') {
      const s = await check()
      if (
        !s.configured ||
        !s.apis.some(
          (a) =>
            ['kin', 'news', ...(category ? ['shopping'] : [])].includes(a.api) &&
            a.enabled &&
            !a.blocked,
        )
      ) {
        setMessage('LIVE 발굴 보류: 사용 가능한 API가 없습니다. 고급 설정의 API 상태를 확인하세요.')
        return
      }
    }
    const previous = createCandidateStore(localStorage).list()
    const existing = [
      ...ideas.flatMap((i) => [i.keyword, i.title]),
      ...previous.filter((c) => c.candidate.mode === mode).map((c) => c.candidate.keyword),
      ...createPublishingStore(localStorage)
        .read()
        .publications.map((p) => p.keyword),
    ]
    const client = await clients(true)
    const result = await collectDiscovery(seeds, client.hub, dates, category, Number(target))
    const collected = groupDiscovery(result.results, existing).slice(0, Number(target))
    persist((w) => ({
      ...w,
      settings: { custom, interests: selected, target, mode, category, device, dates },
      rows: [
        ...collected.map((c) => {
          const old = w.rows.find((r) => r.key === c.key)
          const sources = [...(old?.sources ?? [])]
          for (const s of c.sources)
            if (
              !sources.some(
                (x) => x.api === s.api && x.url === s.url && x.collectedAt === s.collectedAt,
              )
            )
              sources.push(s)
          return { ...c, sources }
        }),
        ...w.rows.filter((r) => !collected.some((c) => c.key === r.key)),
      ],
    }))
    setPicked([])
    setExpanded('')
    setMessage(
      result.errors.length
        ? result.errors.join(' / ')
        : mode === 'DEMO'
          ? 'DEMO 모의 후보입니다. 외부 API는 호출하지 않았습니다.'
          : `이번 수집 ${collected.length}개 / 요청 ${target}개. 중복·API 결과에 따라 적을 수 있습니다. 분석할 후보를 선택하세요.`,
    )
  }
  async function clients(hubOnly = false) {
    controller.current = new AbortController()
    if (mode === 'DEMO') return { hub: demoHub, volume: demoVolume }
    const [usage, hubStatus] = await Promise.all([
      hubOnly
        ? Promise.resolve({
            used: 0,
            remaining: 0,
            limit: 30,
            day: new Date().toISOString().slice(0, 10),
            resetsAt: new Date(Date.now() + 86400000).toISOString(),
            lastQueryAt: null,
            blocked: false,
            migration: false,
          })
        : readBudget(),
      fetchHubStatus(),
    ])
    setStatus(hubStatus)
    setSearchadBudgetKnown(!hubOnly)
    return analysisSession(usage, hubStatus, controller.current.signal, setRemaining)
  }
  async function quick() {
    const chosen = rows.filter((r) => picked.includes(r.key))
    const plan = quickPlan(chosen, dataRef.current.metrics)
    const client = await clients()
    let done = 0
    for (const { keyword } of plan.words) {
      if (controller.current?.signal.aborted) break
      const previous = dataRef.current.metrics[metricKey(mode, keyword)]
      const needs = (api: 'searchad' | 'blog') =>
        !previous?.states?.[api] || previous.states[api]!.state === '미조회'
      if (
        'remaining' in client &&
        ((needs('searchad') && !analysisVolume.peek(keyword) && client.remaining.searchad <= 0) ||
          (needs('blog') &&
            !analysisHub.peek({ api: 'blog', query: keyword, ...dates, device }) &&
            client.remaining.hub.blog <= 0))
      ) {
        setMessage('빠른 분석 중단: 필요한 API의 남은 예산이 부족합니다. 미조회 후보는 보존됩니다.')
        break
      }
      setProgress(`키워드 ${done + 1}/${plan.words.length}: ${keyword}`)
      const value = await analyzeDiscovery(
        keyword,
        client.hub,
        client.volume,
        { ...dates, device },
        '',
        {
          previous: dataRef.current.metrics[metricKey(mode, keyword)],
          reuse: true,
          apis: ['blog'],
        },
      )
      saveMetric(keyword, value)
      done++
      if (
        value.errors.length ||
        Object.values(value.states ?? {}).some((s) => s.state === '조회 실패')
      ) {
        setMessage(
          `빠른 분석 중단: ${value.errors.join(' / ') || '이전 실패 기록은 상세 화면에서 명시적으로 재실행하세요.'}`,
        )
        break
      }
    }
    setProgress(`${done}/${plan.words.length} 키워드 처리 · 미분석 후보 보존`)
  }
  async function detail(c: DiscoveryCandidate, refresh = false) {
    setExpanded(c.key)
    const keywords = dualKeywords(c.title),
      client = await clients()
    const mainKey = metricKey(mode, keywords.main),
      detailKey = metricKey(mode, keywords.detail)
    const errors: string[] = []
    if (mainKey !== detailKey) {
      const main = await analyzeDiscovery(
        keywords.main,
        client.hub,
        client.volume,
        { ...dates, device },
        '',
        {
          previous: dataRef.current.metrics[mainKey],
          reuse: !refresh,
          apis: ['blog', 'cafe'],
        },
      )
      saveMetric(keywords.main, main)
      errors.push(...main.errors)
    }
    const result = await analyzeDiscovery(
      keywords.detail,
      client.hub,
      client.volume,
      { ...dates, device },
      category,
      {
        previous: {
          ...(dataRef.current.metrics[detailKey] ?? {
            keyword: keywords.detail,
            results: [],
            volume: null,
            volumeAt: null,
            related: [],
            errors: [],
          }),
          review: dataRef.current.analyses[c.key]?.review,
        },
        reuse: !refresh,
        onProgress: (value) =>
          persist((w) => ({ ...w, analyses: { ...w.analyses, [c.key]: value } })),
      },
    )
    saveMetric(keywords.detail, result)
    persist((w) => ({ ...w, analyses: { ...w.analyses, [c.key]: result } }))
    setExpanded(c.key)
    errors.push(...result.errors)
    if (errors.length) setMessage(errors.join(' / '))
  }
  function save(c: DiscoveryCandidate, manuscript: boolean) {
    if (manuscript && c.mode === 'DEMO') {
      setMessage('DEMO 자료는 유료 원고 생성에 전달하지 않습니다.')
      return
    }
    try {
      const store = createCandidateStore(localStorage),
        candidate = discoveryToCandidate(
          c,
          analysis[c.key],
          metricFor(c, dualKeywords(c.title).main, metrics),
        )
      const linkedIdea = ideas.find(
        (i) => normalizeKeyword(i.keyword) === normalizeKeyword(c.keyword),
      )
      const id = store.saveAnalysis(
        candidate,
        { topic: c.title, reviewmanTopics: [] },
        linkedIdea?.id ?? null,
      )
      setMessage('후보를 저장했습니다. 기존 분석 이력과 함께 전체 JSON 백업에 포함됩니다.')
      if (manuscript) navigate(`/manuscripts?candidate=${encodeURIComponent(id)}`)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  const visible = sortDiscovery(rows, metrics, analysis, sort).filter((c) => {
    const a = metricFor(c, dualKeywords(c.title).detail, metrics),
      volume = a?.volume?.total,
      blog = a?.results.find((r) => r.api === 'blog')?.total
    return (
      (!hideDuplicates || !c.duplicate) &&
      (!min || (typeof volume === 'number' && volume >= Number(min))) &&
      (!max || (typeof blog === 'number' && blog <= Number(max)))
    )
  })
  const plan = quickPlan(
    rows.filter((r) => picked.includes(r.key)),
    metrics,
  )
  const detailCalls = (c: DiscoveryCandidate) =>
    dualKeywords(c.title).main === dualKeywords(c.title).detail
      ? category
        ? 5
        : 4
      : category
        ? 8
        : 7
  return (
    <section className="panel discovery-panel" aria-label="API 글감 발굴">
      <div className="discovery-heading">
        <div>
          <h2>글감 발굴</h2>
          <p>관심 주제에서 후보를 모으고, 선택한 글감만 분석하세요.</p>
        </div>
        <Link className="button" to="/captures">
          캡처·AI 판독
        </Link>
      </div>
      <div className="discovery-interests">
        {interests.map((i) => (
          <label key={i}>
            <input
              type="checkbox"
              checked={selected.includes(i)}
              disabled={!!busy}
              onChange={(e) =>
                setSelected(e.target.checked ? [...selected, i] : selected.filter((s) => s !== i))
              }
            />
            {i}
          </label>
        ))}
      </div>
      <label className="discovery-topic">
        나의 관심 주제
        <input
          value={custom}
          maxLength={200}
          disabled={!!busy}
          placeholder="예: 지금 조사 중인 주제, 새로 궁금한 문제"
          onChange={(e) => setCustom(e.target.value)}
        />
      </label>
      <div className="discovery-actions">
        <label>
          수집 개수
          <input
            aria-label="수집 개수"
            type="number"
            min="1"
            max="100"
            value={target}
            disabled={!!busy}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <button
          className="button primary"
          disabled={!!busy || !seeds.length}
          onClick={() => void run('발굴 중', discover)}
        >
          {busy === '발굴 중' ? busy : '글감 발굴'}
        </button>
        <button
          className="button"
          disabled={!!busy}
          onClick={() =>
            void run('연결 확인 중', async () => {
              const s = await check()
              setMessage(
                s.configured
                  ? '서버 인증정보 등록 확인. API별 활성화 상태를 확인하세요.'
                  : 'Worker 인증정보 미등록',
              )
            })
          }
        >
          연결 상태 확인
        </button>
        <small>조회 주제: {seeds.join(' · ') || '선택 필요'} · 최대 2개</small>
      </div>
      <p className="discovery-hold">
        LIVE 발굴은 버튼을 누를 때만 실행됩니다. 예상 외부 호출:{' '}
        {mode === 'DEMO' ? 0 : seeds.length * 2 + (category ? 1 : 0)}회 이하. 기본 10개, 최대 100개
        요청; 중복·제공 결과에 따라 줄어들 수 있습니다.
      </p>
      <details className="discovery-advanced">
        <summary>고급 설정·API 상태·실험용 필터</summary>
        <div className="discovery-settings">
          <label>
            실행 모드
            <select
              value={mode}
              disabled={!!busy}
              onChange={(e) => {
                setMode(e.target.value as typeof mode)
                setPicked([])
                setExpanded('')
                setRemaining(null)
                setProgress('')
                setMessage('')
              }}
            >
              <option value="LIVE">LIVE 실제 API</option>
              <option value="DEMO">DEMO 모의 흐름 (외부 호출 없음)</option>
            </select>
          </label>
          <label>
            시작 날짜
            <input
              type="date"
              value={dates.startDate}
              disabled={!!busy}
              onChange={(e) => setDates({ ...dates, startDate: e.target.value })}
            />
          </label>
          <label>
            종료 날짜
            <input
              type="date"
              value={dates.endDate}
              disabled={!!busy}
              onChange={(e) => setDates({ ...dates, endDate: e.target.value })}
            />
          </label>
          <label>
            기기
            <select
              value={device}
              disabled={!!busy}
              onChange={(e) => setDevice(e.target.value as typeof device)}
            >
              <option value="all">전체</option>
              <option value="pc">PC</option>
              <option value="mo">모바일</option>
            </select>
          </label>
          <label>
            쇼핑 분야 코드 (선택)
            <input
              value={category}
              disabled={!!busy}
              maxLength={8}
              inputMode="numeric"
              placeholder="NAVER 쇼핑 cat_id"
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            최소 월 검색량
            <input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label>
            블로그 API 결과 수 이하
            <input type="number" min="0" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        <div className="discovery-actions">
          <button
            className="button"
            onClick={() => {
              setMin('3000')
              setMax('1000')
            }}
          >
            3,000회·1,000건 실험
          </button>
          {[300, 500].map((n) => (
            <button key={n} className="button" onClick={() => setMax(String(n))}>
              결과 {n}건 이하
            </button>
          ))}
          <button
            className="button"
            onClick={() => {
              setMin('')
              setMax('')
            }}
          >
            필터 해제
          </button>
          <label>
            <input
              type="checkbox"
              checked={hideDuplicates}
              onChange={(e) => setHideDuplicates(e.target.checked)}
            />
            중복 후보 접기
          </label>
        </div>
        <p>
          수치 미확인 후보는 숫자 필터에서만 숨겨지며 삭제되지 않습니다. 결과 수는 통합검색 문서
          수나 상위 노출 확률이 아닙니다. 발굴 최대 5회, 이중 상세 분석 최대 HUB 6회 + 검색광고
          2회이며 자동 재시도하지 않습니다.
        </p>
        {status && (
          <>
            <p>
              HUB 내부 한도: API별 일 {status.limits.daily}회 / 월 {status.limits.monthly}회. 기존
              API 예산과 별도입니다.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>API</th>
                    <th>상태</th>
                    <th>일 / 월 사용</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {status.apis.map((a) => (
                    <tr key={a.api}>
                      <td>{hubLabels[a.api]}</td>
                      <td>
                        {a.enabled && status.configured ? 'LIVE' : '보류'}
                        {a.blocked ? ' · 오류 차단' : ''}
                      </td>
                      <td>
                        {a.dailyUsed} / {a.monthlyUsed}
                      </td>
                      <td>{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <a href="https://www.ncloud.com/support/notice/all/2243" target="_blank" rel="noreferrer">
          NAVER 검색 데이터 이용 조건
        </a>
      </details>
      {busy && <p role="status">{busy}… 화면을 유지해 주세요.</p>}
      {initial.error && <p role="alert">{initial.error}</p>}
      {progress && <p role="status">{progress}</p>}
      {remaining && (
        <p className="budget-summary">
          남은 예산 (실행 시점): 검색광고{' '}
          {searchadBudgetKnown ? `${remaining.searchad}회` : '미조회'} · HUB 블로그{' '}
          {remaining.hub.blog ?? 0}회 / 카페 {remaining.hub.cafe ?? 0}회 / 트렌드{' '}
          {remaining.hub.trend ?? 0}회 · {remaining.message}
        </p>
      )}
      {!!busy && (
        <button className="button" onClick={() => controller.current?.abort()}>
          분석 중단
        </button>
      )}
      {message && (
        <p role="status" className="discovery-message">
          {message}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="discovery-actions quick-actions">
            <label>
              <input
                type="checkbox"
                checked={visible.length > 0 && visible.every((r) => picked.includes(r.key))}
                disabled={!!busy}
                onChange={(e) =>
                  setPicked(
                    e.target.checked
                      ? [...new Set([...picked, ...visible.map((r) => r.key)])]
                      : picked.filter((k) => !visible.some((r) => r.key === k)),
                  )
                }
              />
              현재 목록 선택
            </label>
            <button
              className="button primary"
              disabled={!!busy || !picked.length || !!initial.error}
              onClick={() => void run('빠른 분석 중', quick)}
            >
              후보 빠른 분석
            </button>
            <label>
              정렬
              <select
                aria-label="후보 정렬"
                value={sort}
                disabled={!!busy}
                onChange={(e) => setSort(e.target.value as DualSort)}
              >
                {Object.entries(dualSorts).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            선택 {picked.length}개 · 고유 키워드 {plan.words.length}개 · 예상 외부 호출 최대
            검색광고 {plan.searchad}회 + HUB 블로그 {plan.blog}회. 저장 자료·캐시 우선, 예산
            부족·오류 시 중단합니다. 검색광고 새 조회 간격은 10초입니다.
          </p>
          {sort === 'ratio' && (
            <p>
              검색량 ÷ 블로그 API 결과 수는 실험용 참고 비율입니다. 실제 네이버 경쟁도·노출 확률이
              아닙니다. 결과 수 0 또는 자료 부족이면 계산을 보류합니다.
            </p>
          )}
          <p>
            {visible.length} / {rows.length}개 후보 ·{' '}
            {mode === 'DEMO' ? 'DEMO — 실제 측정값 아님' : 'LIVE'}
          </p>
          <div className="table-scroll">
            <table className="discovery-table dual-table">
              <thead>
                <tr>
                  <th>선택·글감</th>
                  <th>출처·중복</th>
                  <th>메인 키워드</th>
                  <th>세부 키워드</th>
                  <th>메인 검색량</th>
                  <th>세부 검색량</th>
                  <th>메인 블로그</th>
                  <th>세부 블로그</th>
                  <th>검토 판단</th>
                  <th>다음 단계</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const keys = dualKeywords(c.title),
                    main = metricFor(c, keys.main, metrics),
                    detailData = metricFor(c, keys.detail, metrics),
                    a = analysis[c.key] ?? detailData,
                    rec = discoveryRecommendation(c, a, main)
                  return (
                    <tr key={c.key}>
                      <td data-label="글감">
                        <input
                          aria-label={`분석 선택: ${c.title}`}
                          type="checkbox"
                          checked={picked.includes(c.key)}
                          disabled={!!busy}
                          onChange={(e) =>
                            setPicked(
                              e.target.checked
                                ? [...picked, c.key]
                                : picked.filter((k) => k !== c.key),
                            )
                          }
                        />
                        <strong>{c.title}</strong>
                      </td>
                      <td data-label="출처">
                        {[...new Set(c.sources.map((s) => s.api))].join(' · ')}
                        <small>{c.duplicate ? '기존 주제 중복 가능' : '동일 주제 미발견'}</small>
                      </td>
                      <td data-label="메인">
                        {keys.main}
                        <small>규칙 추론</small>
                      </td>
                      <td data-label="세부">
                        {keys.detail}
                        <small>원본 의도 기반</small>
                      </td>
                      <td data-label="메인 검색량">
                        <MetricValue analysis={main} api="searchad" mode={mode} />
                      </td>
                      <td data-label="세부 검색량">
                        <MetricValue analysis={detailData} api="searchad" mode={mode} />
                      </td>
                      <td data-label="메인 블로그">
                        <MetricValue analysis={main} api="blog" mode={mode} />
                      </td>
                      <td data-label="세부 블로그">
                        <MetricValue analysis={detailData} api="blog" mode={mode} />
                        {sort === 'ratio' && (
                          <small>실험 비율 {demandRatio(detailData)?.toFixed(3) ?? '보류'}</small>
                        )}
                      </td>
                      <td data-label="발행 추천">
                        <strong>{rec.status}</strong>
                        <small>미확인 {rec.missing.length}개 · 근거에서 확인</small>
                      </td>
                      <td data-label="다음 단계">
                        <div className="discovery-actions">
                          <button
                            className="button"
                            disabled={!!busy}
                            onClick={() => {
                              setExpanded(c.key)
                              if (!analysis[c.key]) void run('상세 분석 중', () => detail(c))
                            }}
                          >
                            상세 분석
                          </button>
                          <small>
                            {mode === 'DEMO'
                              ? '외부 호출 0회'
                              : analysis[c.key]
                                ? '기존 결과 열기 · 0회'
                                : `최대 ${detailCalls(c)}회 · 저장 자료 적중 시 감소`}
                          </small>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {rows
        .filter((c) => c.key === expanded)
        .map((c) => {
          const a = analysis[c.key]
          return (
            <div key={c.key}>
              <DualMetrics
                main={metricFor(c, dualKeywords(c.title).main, metrics)}
                detail={metricFor(c, dualKeywords(c.title).detail, metrics)}
                mainKeyword={dualKeywords(c.title).main}
                detailKeyword={dualKeywords(c.title).detail}
                mode={mode}
              />
              <IntegratedDetail
                key={c.key}
                candidate={{ ...c, keyword: dualKeywords(c.title).detail }}
                analysis={a}
                mainAnalysis={metricFor(c, dualKeywords(c.title).main, metrics)}
                busy={!!busy}
                expectedCalls={detailCalls(c)}
                onAnalyze={() => void run('상세 분석 중', () => detail(c, true))}
                onSave={(manuscript) => save(c, manuscript)}
                onReview={(review) =>
                  persist((w) => ({
                    ...w,
                    analyses: { ...w.analyses, [c.key]: { ...w.analyses[c.key], review } },
                  }))
                }
              />
            </div>
          )
        })}
    </section>
  )
}
