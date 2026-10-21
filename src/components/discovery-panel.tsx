import { HubEvidence } from './hub-evidence'
import { useRef, useState } from 'react'
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
  prioritizeDiscovery,
  type DiscoveryAnalysis,
  type DiscoveryCandidate,
} from '../domain/discovery'
import { demoHub, fetchHubStatus, requestHub } from '../providers/hub-client'
import { createSearchAdProvider } from '../providers/searchad-client'
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
  const [selected, setSelected] = useState<string[]>([]),
    [custom, setCustom] = useState('')
  const [mode, setMode] = useState<'LIVE' | 'DEMO'>('LIVE'),
    [category, setCategory] = useState('')
  const [device, setDevice] = useState<'all' | 'pc' | 'mo'>('all'),
    [dates, setDates] = useState(period)
  const [status, setStatus] = useState<HubStatus | null>(null),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState('')
  const [rows, setRows] = useState<DiscoveryCandidate[]>([]),
    [analysis, setAnalysis] = useState<Record<string, DiscoveryAnalysis>>({})
  const [expanded, setExpanded] = useState(''),
    [min, setMin] = useState(''),
    [max, setMax] = useState(''),
    [hideDuplicates, setHideDuplicates] = useState(false)
  const running = useRef(false)
  const seeds = discoverySeeds([...custom.split(/[,\n]/).filter(Boolean), ...selected], ideas, [])
  const query = mode === 'DEMO' ? demoHub : requestHub
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
    const result = await collectDiscovery(seeds, query, dates, category)
    setRows(groupDiscovery(result.results, existing))
    setAnalysis({})
    setExpanded('')
    setMessage(
      result.errors.length
        ? result.errors.join(' / ')
        : mode === 'DEMO'
          ? 'DEMO 모의 후보입니다. 외부 API는 호출하지 않았습니다.'
          : '후보 수집 완료. 선택한 주제만 상세 분석하세요.',
    )
  }
  async function detail(c: DiscoveryCandidate) {
    const result = await analyzeDiscovery(
      c.keyword,
      query,
      mode === 'DEMO' ? demoVolume : createSearchAdProvider().query,
      { ...dates, device },
      category,
    )
    setAnalysis((current) => ({ ...current, [c.key]: result }))
    setExpanded(c.key)
    if (result.errors.length) setMessage(result.errors.join(' / '))
  }
  function save(c: DiscoveryCandidate, manuscript: boolean) {
    if (manuscript && c.mode === 'DEMO') {
      setMessage('DEMO 자료는 유료 원고 생성에 전달하지 않습니다.')
      return
    }
    try {
      const store = createCandidateStore(localStorage),
        candidate = discoveryToCandidate(c, analysis[c.key])
      const linkedIdea = ideas.find(
        (i) => normalizeKeyword(i.keyword) === normalizeKeyword(c.keyword),
      )
      const result = store.save(
        [candidate],
        { topic: c.title, reviewmanTopics: [] },
        linkedIdea?.id ?? null,
      )
      setMessage(
        result.added
          ? '후보를 저장했습니다. 전체 JSON 백업에 포함됩니다.'
          : '이미 저장된 후보입니다. 기존 자료를 보존했습니다.',
      )
      if (manuscript) {
        const saved = store
          .list()
          .find(
            (s) =>
              s.candidate.mode === c.mode &&
              normalizeKeyword(s.candidate.keyword) === normalizeKeyword(c.keyword),
          )
        if (saved) navigate(`/manuscripts?candidate=${encodeURIComponent(saved.id)}`)
      }
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  const visible = prioritizeDiscovery(rows, analysis).filter((c) => {
    const a = analysis[c.key],
      volume = a?.volume?.total,
      blog = a?.results.find((r) => r.api === 'blog')?.total
    return (
      (!hideDuplicates || !c.duplicate) &&
      (!min || (typeof volume === 'number' && volume >= Number(min))) &&
      (!max || (typeof blog === 'number' && blog <= Number(max)))
    )
  })
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
        LIVE 발굴은 버튼을 누를 때만 실행됩니다. 후보 수집 후 선택한 글감만 상세 분석하세요.
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
                setRows([])
                setAnalysis({})
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
          수나 상위 노출 확률이 아닙니다. 발굴 최대 5회, 상세 분석 최대 HUB 4회 + 검색광고 1회이며
          자동 재시도하지 않습니다.
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
      {message && (
        <p role="status" className="discovery-message">
          {message}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p>
            {visible.length} / {rows.length}개 후보 ·{' '}
            {mode === 'DEMO' ? 'DEMO — 실제 측정값 아님' : 'LIVE'}
          </p>
          <div className="table-scroll">
            <table className="discovery-table">
              <thead>
                <tr>
                  <th>글감·키워드</th>
                  <th>출처·중복</th>
                  <th>검색량 / API 결과 수</th>
                  <th>검토 판단</th>
                  <th>다음 단계</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const a = analysis[c.key],
                    rec = discoveryRecommendation(c, a)
                  return (
                    <tr key={c.key}>
                      <td>
                        <strong>{c.title}</strong>
                        <small>{c.keyword}</small>
                      </td>
                      <td>
                        {[...new Set(c.sources.map((s) => s.api))].join(' · ')}
                        <small>{c.duplicate ? '기존 주제 중복 가능' : '동일 주제 미발견'}</small>
                      </td>
                      <td>
                        {a?.volume?.total ?? '미확인'} /{' '}
                        {a?.results.find((r) => r.api === 'blog')?.total ?? '미확인'}
                        <small>검색량 / 블로그 API 결과 수</small>
                      </td>
                      <td>
                        <strong>{rec.status}</strong>
                        <small>미확인 {rec.missing.length}개 · 근거에서 확인</small>
                      </td>
                      <td>
                        <div className="discovery-actions">
                          <button
                            className="button"
                            disabled={!!busy}
                            onClick={() => void run('상세 분석 중', () => detail(c))}
                          >
                            상세 분석
                          </button>
                          <button
                            className="button"
                            onClick={() => setExpanded(expanded === c.key ? '' : c.key)}
                          >
                            근거
                          </button>
                          <button
                            className="button"
                            disabled={!!busy}
                            onClick={() => save(c, false)}
                          >
                            후보 저장
                          </button>
                          <button
                            className="button"
                            disabled={!!busy || c.mode === 'DEMO'}
                            onClick={() => save(c, true)}
                          >
                            원고 제작
                          </button>
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
          const a = analysis[c.key],
            rec = discoveryRecommendation(c, a)
          return (
            <section className="discovery-evidence" key={c.key}>
              <h3>{c.title} — 근거</h3>
              <ul>
                {rec.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p>미확인: {rec.missing.join(', ')}</p>
              {a?.related.length ? <p>검색광고 관련어: {a.related.join(' · ')}</p> : null}
              <HubEvidence results={a?.results ?? []} />
              <Link to={`/keywords?keyword=${encodeURIComponent(c.keyword)}`}>
                기존 키워드 분석으로 이동
              </Link>
            </section>
          )
        })}
    </section>
  )
}
