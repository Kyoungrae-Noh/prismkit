import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { createCandidateStore } from '../data/candidate-store'
import { createPublishingStore } from '../data/publishing-store'
import { normalizeKeyword } from '../domain/candidates'
import {
  analyzeDiscovery,
  discoveryToCandidate,
  type DiscoveryAnalysis,
  type DiscoveryCandidate,
} from '../domain/discovery'
import { analysisHub, analysisVolume } from '../providers/analysis-client'
import { analysisKeyword } from '../domain/integrated-analysis'
import type { LiveCandidateBatch } from './candidate-panel'
import { IntegratedDetail } from './integrated-detail'

/** Explicit HUB queries reuse already-fetched search volume; typing and navigation never call APIs. */
export function HubCompetition({
  keyword,
  live,
  ideaId,
}: {
  keyword: string
  live: LiveCandidateBatch | null
  ideaId: string | null
}) {
  const { ideas } = useWorkspace(),
    navigate = useNavigate()
  const [result, setResult] = useState<{
    candidate: DiscoveryCandidate
    analysis: DiscoveryAnalysis
  } | null>(null)
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const [min, setMin] = useState(''),
    [max, setMax] = useState('')
  const running = useRef(false)
  async function analyze() {
    const term = analysisKeyword(keyword)
    if (running.current || !term) return
    running.current = true
    setBusy(true)
    setMessage('')
    try {
      const end = Date.now() + 9 * 3600000 - 86400000
      const analysis = await analyzeDiscovery(
        term,
        analysisHub,
        async () => {
          if (
            live &&
            normalizeKeyword(live.keyword) === normalizeKeyword(term) &&
            Date.now() - Date.parse(live.data.volume.collectedAt ?? '') < 300000
          )
            return { ...live.data, cached: true }
          return analysisVolume(term)
        },
        {
          startDate: new Date(end - 29 * 86400000).toISOString().slice(0, 10),
          endDate: new Date(end).toISOString().slice(0, 10),
        },
        '',
        { previous: result?.analysis },
      )
      const saved = createCandidateStore(localStorage).list(),
        published = createPublishingStore(localStorage).read().publications
      const candidate: DiscoveryCandidate = {
        key: term,
        title: keyword.trim(),
        keyword: term,
        mode: 'LIVE',
        sources: analysis.results.flatMap((r) =>
          r.items.map((i) => ({
            api: r.api,
            url: i.url,
            date: i.date,
            collectedAt: r.collectedAt,
          })),
        ),
        occurrences: 0,
        duplicate:
          ideas.some(
            (i) => i.id !== ideaId && normalizeKeyword(i.keyword) === normalizeKeyword(term),
          ) ||
          saved.some(
            (s) =>
              s.candidate.mode === 'LIVE' &&
              normalizeKeyword(s.candidate.keyword) === normalizeKeyword(term),
          ) ||
          published.some((p) => normalizeKeyword(p.keyword) === normalizeKeyword(term)),
        intent: '키워드 직접 분석 — 검색 의도 검토 필요',
        reasons: ['측정: 사용자가 선택한 키워드의 API 검색 결과; 질문 반복 빈도는 미측정'],
      }
      setResult({ candidate, analysis })
      setMessage(analysis.errors.join(' / '))
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  function manuscript(toManuscript = true) {
    if (!result) return
    try {
      const store = createCandidateStore(localStorage),
        c = result.candidate
      const id = store.saveAnalysis(
        discoveryToCandidate(c, result.analysis),
        { topic: c.title, reviewmanTopics: [] },
        ideaId,
      )
      if (toManuscript) navigate(`/manuscripts?candidate=${encodeURIComponent(id)}`)
      else setMessage('후보를 저장했습니다. 기존 분석 이력과 함께 전체 JSON 백업에 포함됩니다.')
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  const current =
    result && normalizeKeyword(result.candidate.title) === normalizeKeyword(keyword) ? result : null
  const blog = current?.analysis.results.find((r) => r.api === 'blog')?.total,
    cafe = current?.analysis.results.find((r) => r.api === 'cafe')?.total,
    volume = current?.analysis.volume?.total
  const matches =
    (!min || (typeof volume === 'number' && volume >= Number(min))) &&
    (!max || (typeof blog === 'number' && blog <= Number(max)))
  return (
    <section className="panel discovery-panel" aria-label="키워드 경쟁 분석">
      <div className="discovery-heading">
        <div>
          <h2>경쟁 결과·검색 추이</h2>
          <p>핵심 키워드의 검색량·블로그·카페·트렌드를 한 번에 조회합니다.</p>
        </div>
        <button
          className="button primary"
          disabled={busy || !keyword.trim()}
          onClick={() => void analyze()}
        >
          {busy ? '경쟁 조회 중' : '경쟁·트렌드 조회'}
        </button>
      </div>
      <p>
        분석 핵심어: {analysisKeyword(keyword) || '위에서 입력하세요'} · 예상 외부 호출 최대 4회
        (검색광고 1회 + HUB 3회). 기존 검색량·캐시를 우선 사용합니다. API 결과 수는 통합검색 전체
        문서 수·노출 순위가 아닙니다.
      </p>
      {busy && <p role="status">경쟁 결과를 조회하고 있습니다…</p>}
      {message && <p role="status">{message}</p>}
      <details className="discovery-advanced">
        <summary>실험용 검색량·결과 수 필터</summary>
        <div className="discovery-settings">
          <label>
            최소 월 검색량
            <input type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label>
            블로그 결과 수 이하
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
            <button className="button" key={n} onClick={() => setMax(String(n))}>
              {n}건 이하
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
        </div>
      </details>
      {current && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>키워드</th>
                  <th>월 검색량</th>
                  <th>블로그 API 결과</th>
                  <th>카페 API 결과</th>
                  <th>실험 조건</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{current.candidate.keyword}</td>
                  <td>{volume ?? '미확인'}</td>
                  <td>{blog ?? '미확인'}</td>
                  <td>{cafe ?? '미확인'}</td>
                  <td>{matches ? '일치' : '불일치 또는 자료 부족 — 보존됨'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <IntegratedDetail
            candidate={current.candidate}
            analysis={current.analysis}
            busy={busy}
            expectedCalls={4}
            onAnalyze={() => void analyze()}
            onSave={manuscript}
            onReview={(review) =>
              setResult((value) =>
                value ? { ...value, analysis: { ...value.analysis, review } } : value,
              )
            }
          />
        </>
      )}
    </section>
  )
}
