import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { createCandidateStore, type SavedCandidate } from '../data/candidate-store'
import { createPublishingStore } from '../data/publishing-store'
import { createResearchStore } from '../data/research-store'
import { createCaptureStore } from '../data/capture-store'
import { emptyPublishing, type PublishingData } from '../domain/publishing'
import { emptyCaptures, type CaptureData } from '../domain/captures'
import { defaultRanking, rankCandidates, rankingPresets } from '../domain/ranking'
import { displayCount, type KeywordResearch } from '../domain/research'
import { categories } from '../domain/models'
export function RecommendationsPage() {
  const { ideas } = useWorkspace()
  const [saved, setSaved] = useState<SavedCandidate[]>([]),
    [publishing, setPublishing] = useState<PublishingData>(emptyPublishing),
    [research, setResearch] = useState<KeywordResearch[]>([]),
    [captures, setCaptures] = useState<CaptureData>(emptyCaptures)
  const [settings, setSettings] = useState(defaultRanking),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [limit, setLimit] = useState(20)
  async function load() {
    try {
      const data = createCaptureStore(localStorage).read()
      setSaved(createCandidateStore(localStorage).list())
      setPublishing(createPublishingStore(localStorage).read())
      setResearch(await createResearchStore(localStorage).listResearch())
      setCaptures(data)
      if (data.report) setSettings(data.report.settings)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '추천 자료 읽기 실패')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  let rows: ReturnType<typeof rankCandidates> = [],
    filterError = ''
  try {
    rows = rankCandidates(saved, ideas, research, publishing, captures, settings)
  } catch (e) {
    filterError = e instanceof Error ? e.message : '필터 오류'
  }
  const recommended = rows
    .filter((r) => ['발행 검토 추천', '롱테일 전환 추천'].includes(r.status))
    .slice(0, 10)
  const waiting = rows.filter((r) => !recommended.includes(r))
  const compare = rows.filter((r) => selected.includes(r.id))
  function fields(row: (typeof rows)[number]) {
    const c = row.item.candidate
    return (
      <>
        <p>
          추천 키워드: <strong>{c.keyword}</strong> · {row.category} · {row.intent}
        </p>
        <p>
          {c.mode} · PC {displayCount(c.pc)} / 모바일 {displayCount(c.mobile)} / 전체{' '}
          {displayCount(c.total)} · 최근 30일 검색량 · 확인 {c.collectedAt ?? '미확인'}
          {!row.volumeKnown ? ' · 검색량 미확인/재확인 필요' : ''}
        </p>
        <p>
          경쟁 문서 수: {row.documents ? displayCount(row.documents.count) : '확인 불가'} · 경쟁
          분석: {row.competition}
        </p>
        {row.documents && (
          <p>
            문서 수 출처: {row.documents.source} · {row.documents.checkedDate} · 검색 범위:{' '}
            {row.documents.scope}
          </p>
        )}
        <p>
          시의성: {row.timeliness} · Reviewman: {row.reviewman || '연결 근거 미확인'}
        </p>
        <p>
          블로그 계정: {row.account.account ?? '추천 보류'} · {row.account.reason}
        </p>
      </>
    )
  }
  return (
    <div className="recommendations-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVIDENCE REVIEW</div>
          <h1>발행 후보 TOP 10</h1>
          <p>
            저장된 실제·수동 자료를 비교하는 실험용 규칙 평가입니다. AI 평가나 노출·수익 보장이
            아닙니다.
          </p>
        </div>
      </div>
      <section className="panel research-panel" aria-label="후보 근거 요약">
        <h2>검색 수요·경쟁·추천 근거</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>키워드</th>
                <th>검색량</th>
                <th>경쟁 문서</th>
                <th>판단·부족한 근거</th>
                <th>다음 단계</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((r) => (
                <tr key={r.id}>
                  <th>{r.item.candidate.keyword}</th>
                  <td>{r.volumeKnown ? displayCount(r.item.candidate.total) : '미확인'}</td>
                  <td>{r.documents ? displayCount(r.documents.count) : '미확인'}</td>
                  <td>
                    {r.status}
                    <br />
                    {r.missing.join(' · ') || r.reasons.join(' · ')}
                  </td>
                  <td>
                    <Link to={`/manuscripts?candidate=${encodeURIComponent(r.id)}`}>원고 제작</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel research-panel">
        <p>
          검토 가능한 후보만 최대 10개를 제시합니다. 검색량과 문서 수는 출처·확인일을 확인하며
          30일이 지난 근거는 재확인이 필요합니다. DEMO는 제외합니다. 문서 수는 검색 범위의 결과이며
          전체 네이버 문서 수나 검색광고 경쟁도가 아닙니다.
        </p>
        <details>
          <summary>평가 기준 공개</summary>
          <p>
            검색 수요 최대 25점(월 5,000회에서 상한), 사용자 경쟁 분석의 진입 근거 20점, 명확한 검색
            의도 10점, Reviewman 사용자 연결 근거 10점, 시의성 근거 5점, 수익화 가설 5점, 문서 수
            근거 5점, 중복 기획 -30점. 점수는 확률이 아닙니다. 연령 가중치는 없습니다. 점수가 높아도
            필수 근거가 없으면 추천하지 않습니다.
          </p>
          <p>
            신규 계정 적합성은 블로그 노출·공식 매체 점유·차별화 평가를 사용합니다. 계정 추천은
            확인된 발행 이력으로만 판단합니다. 급상승 탐색은 비교 가능한 시계열 데이터가 없어 확인
            불가이며 상승률을 생성하지 않습니다.
          </p>
        </details>
        <details>
          <summary>고급 필터·추천 설정</summary>
          <div className="capture-filters">
            <label>
              추천 실험용 프리셋
              <select
                defaultValue="custom"
                onChange={(e) => {
                  if (e.target.value === 'custom') return
                  const p = rankingPresets[e.target.value as keyof typeof rankingPresets]
                  setSettings({
                    ...settings,
                    min: p.min,
                    documentsMax: p.documentsMax,
                    max: '',
                    documentsMin: '',
                  })
                }}
              >
                <option value="custom">사용자 지정</option>
                {Object.entries(rankingPresets).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label} (월 {p.min || '제한 없음'} / 문서 {p.documentsMax || '제한 없음'})
                  </option>
                ))}
              </select>
            </label>
            <label>
              최소 월 검색량
              <input
                inputMode="numeric"
                value={settings.min}
                onChange={(e) => setSettings({ ...settings, min: e.target.value })}
              />
            </label>
            <label>
              최대 월 검색량
              <input
                inputMode="numeric"
                value={settings.max ?? ''}
                onChange={(e) => setSettings({ ...settings, max: e.target.value })}
              />
            </label>
            <label>
              최소 경쟁 문서 수
              <input
                inputMode="numeric"
                value={settings.documentsMin ?? ''}
                onChange={(e) => setSettings({ ...settings, documentsMin: e.target.value })}
              />
            </label>
            <label>
              최대 경쟁 문서 수
              <input
                inputMode="numeric"
                value={settings.documentsMax}
                onChange={(e) => setSettings({ ...settings, documentsMax: e.target.value })}
              />
            </label>
            <label>
              추천 카테고리
              <select
                value={settings.category}
                onChange={(e) => setSettings({ ...settings, category: e.target.value })}
              >
                <option value="all">전체</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              추천 정렬
              <select
                value={settings.sort}
                onChange={(e) =>
                  setSettings({ ...settings, sort: e.target.value as typeof settings.sort })
                }
              >
                <option value="priority">상태·검토 점수순</option>
                <option value="volume">검색량 높은 순</option>
              </select>
            </label>
          </div>
          <p>
            문서 수 빠른 설정:{' '}
            {[300, 500, 1000, 5000].map((n) => (
              <button
                className="button secondary"
                key={n}
                onClick={() => setSettings({ ...settings, documentsMax: String(n) })}
              >
                {n}개 이하
              </button>
            ))}
          </p>
        </details>
        <div className="capture-actions">
          <button className="button secondary" onClick={() => void load()}>
            저장 근거 다시 읽기
          </button>
          <Link className="button secondary" to="/keywords">
            키워드 조회·후보 저장
          </Link>
          <Link className="button secondary" to="/captures">
            캡처 글감 수집
          </Link>
        </div>
        {captures.report && (
          <p>
            마지막 저장: {new Date(captures.report.at).toLocaleString('ko-KR')} ·{' '}
            {captures.report.candidateIds.length}개. 아래 후보는 현재 근거로 재평가하며, 저장 당시
            결과는 별도로 보존합니다.
          </p>
        )}
        {(error || filterError) && <p role="alert">{error || filterError}</p>}
        {message && <p role="status">{message}</p>}
      </section>
      {!error && !filterError && (
        <details>
          <summary>후보별 상세 근거·비교·추천 저장</summary>
          {captures.report && (
            <section className="panel research-panel" aria-label="저장 당시 추천 결과">
              <details>
                <summary>저장 당시 추천 결과 펼치기</summary>
                <p>과거 스냅샷이며 현재의 발행 가능성을 보장하지 않습니다.</p>
                {captures.report.entries.map((r, index) => (
                  <article className="capture-draft" key={r.id}>
                    <h3>
                      {index + 1}. {r.title}
                    </h3>
                    <p>
                      {r.status} · {r.keyword} · {r.mode}
                    </p>
                    <p>
                      PC {displayCount(r.pc)} · 모바일 {displayCount(r.mobile)} · 전체{' '}
                      {displayCount(r.total)} · {r.source} · {r.collectedAt}
                    </p>
                    <p>
                      문서 수 {r.documents ? displayCount(r.documents.count) : '확인 불가'} ·{' '}
                      {r.documents?.source} · {r.documents?.checkedDate} · {r.documents?.scope}
                    </p>
                    <ul>
                      {[...r.reasons, ...r.missing].map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </details>
            </section>
          )}
          <section className="panel research-panel" aria-label="추천 TOP 10">
            <h2>발행 검토·롱테일 후보 {recommended.length}개 / 최대 10개</h2>
            {!recommended.length && (
              <p>
                현재 근거로 추천할 후보가 없습니다. 아래 조사 대기 목록에서 부족한 자료를
                확인하세요.
              </p>
            )}
            <button
              className="button primary"
              disabled={!recommended.length}
              onClick={() => {
                try {
                  const store = createCaptureStore(localStorage),
                    current = store.read()
                  const report = {
                    at: new Date().toISOString(),
                    settings,
                    candidateIds: recommended.map((r) => r.id),
                    entries: recommended.map((r) => ({
                      id: r.id,
                      title: r.title,
                      keyword: r.item.candidate.keyword,
                      mode: r.item.candidate.mode as 'LIVE' | 'MANUAL',
                      status: r.status,
                      score: r.score,
                      pc: r.item.candidate.pc,
                      mobile: r.item.candidate.mobile,
                      total: r.item.candidate.total,
                      source: r.item.candidate.source,
                      collectedAt: r.item.candidate.collectedAt,
                      documents: r.documents ?? null,
                      reasons: r.reasons,
                      missing: r.missing,
                    })),
                  }
                  store.write({ ...current, report })
                  setCaptures({ ...current, report })
                  setMessage('추천 목록·필터·기존 후보 연결을 저장했습니다.')
                } catch (e) {
                  setError(e instanceof Error ? e.message : '추천 저장 실패')
                }
              }}
            >
              추천 목록 저장
            </button>
            {recommended.map((r, index) => (
              <article className="capture-draft" key={r.id}>
                <h3>
                  {index + 1}. {r.title}
                </h3>
                <strong>
                  {['데이터 부족', '경쟁 추가 조사 필요'].includes(r.status)
                    ? '추가 조사 필요 · ' + r.status
                    : r.status}{' '}
                  · 검토 점수 {r.score}
                </strong>
                {fields(r)}
                {actions(r)}
              </article>
            ))}
          </section>
          <section className="panel research-panel" aria-label="조사 대기 후보">
            <h2>추가 검토 {waiting.length}개</h2>
            <p>
              높은 검색량만으로 검증된 저경쟁 후보로 분류하지 않습니다. 필터를 해제하면 낮은
              검색량·미확인 자료도 다시 볼 수 있습니다.
            </p>
            {waiting.slice(0, limit).map((r) => (
              <article className="capture-draft" key={r.id}>
                <h3>{r.title}</h3>
                <strong>
                  {['데이터 부족', '경쟁 추가 조사 필요'].includes(r.status)
                    ? '추가 조사 필요 · ' + r.status
                    : r.status}{' '}
                  · 검토 점수 {r.score}
                </strong>
                {fields(r)}
                {actions(r)}
              </article>
            ))}
            {waiting.length > limit && (
              <button className="button secondary" onClick={() => setLimit(limit + 20)}>
                20개 더 보기
              </button>
            )}
          </section>
          {!!compare.length && (
            <section className="panel research-panel" aria-label="후보 비교">
              <h2>후보 비교 (최대 3개)</h2>
              <div className="capture-grid">
                {compare.map((r) => (
                  <article key={r.id}>
                    <h3>{r.title}</h3>
                    <strong>{r.status}</strong>
                    {fields(r)}
                  </article>
                ))}
              </div>
            </section>
          )}
        </details>
      )}
    </div>
  )
  function actions(r: (typeof rows)[number]) {
    return (
      <>
        <Link className="button primary" to={`/manuscripts?candidate=${encodeURIComponent(r.id)}`}>
          이 후보로 원고 작성
        </Link>
        <details>
          <summary>추천 이유·추가 확인 사항</summary>
          <ul>
            {r.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          <h4>추가 확인</h4>
          {r.missing.length ? (
            <ul>
              {r.missing.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            <p>확인한 근거 기준 검토 가능. 상위 노출 보장은 아닙니다.</p>
          )}
        </details>
        <div className="capture-actions">
          <label>
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              disabled={!selected.includes(r.id) && selected.length >= 3}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, r.id] : selected.filter((id) => id !== r.id),
                )
              }
            />
            비교 선택
          </label>
          <Link
            className="button secondary"
            to={`/keywords?keyword=${encodeURIComponent(r.item.candidate.keyword)}${r.item.ideaId ? '&idea=' + encodeURIComponent(r.item.ideaId) : ''}`}
          >
            키워드 수정·재분석
          </Link>
          <Link
            className="button secondary"
            to={`/publishing?candidate=${encodeURIComponent(r.id)}`}
          >
            경쟁 분석
          </Link>
        </div>
      </>
    )
  }
}
