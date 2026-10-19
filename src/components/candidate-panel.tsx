import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../app/workspace'
import {
  analyzeCandidates,
  applyCandidateFilters,
  candidateStatuses,
  emptyFilters,
  intents,
  normalizeKeyword,
  sortCandidates,
  summarizeCandidates,
  type CandidateFilters,
  type CandidateInput,
  type CandidateSort,
  type DataMode,
} from '../domain/candidates'
import { displayCount, totalVolume } from '../domain/research'
import { createCandidateStore, type SavedCandidate } from '../data/candidate-store'
import type { SearchAdResponse } from '../providers/searchad-types'
export interface LiveCandidateBatch {
  keyword: string
  data: SearchAdResponse
}
export function CandidatePanel({ live }: { live: LiveCandidateBatch | null }) {
  const { keywords, ideas, researchRepository } = useWorkspace()
  const [mode, setMode] = useState<DataMode>('DEMO'),
    [topic, setTopic] = useState(''),
    [reviewman, setReviewman] = useState('')
  const [filters, setFilters] = useState<CandidateFilters>({ ...emptyFilters }),
    [sort, setSort] = useState<CandidateSort>('priority')
  const [manual, setManual] = useState<CandidateInput[]>([]),
    [loadError, setLoadError] = useState(''),
    [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [ideaId, setIdeaId] = useState(''),
    [saved, setSaved] = useState<SavedCandidate[]>([]),
    [storeError, setStoreError] = useState(''),
    [notice, setNotice] = useState(''),
    [page, setPage] = useState(0)
  const store = useMemo(() => createCandidateStore(window.localStorage), [])
  useEffect(() => {
    if (mode === 'LIVE' && live) setTopic(live.keyword)
  }, [live, mode])
  useEffect(() => {
    let active = true
    if (mode === 'MANUAL')
      void researchRepository
        .listResearch()
        .then((rows) => {
          if (active) {
            setManual(
              rows.map((row) => ({
                keyword: row.keyword,
                pc: row.pc,
                mobile: row.mobile,
                total: totalVolume(row.pc, row.mobile),
                collectedAt: row.checkedDate,
                source: row.source,
                mode: 'MANUAL',
              })),
            )
            setLoadError('')
          }
        })
        .catch((error) => {
          if (active) {
            setManual([])
            setLoadError(error.message)
          }
        })
    return () => {
      active = false
    }
  }, [mode, researchRepository, revision])
  useEffect(() => {
    try {
      setSaved(store.list())
      setStoreError('')
    } catch (error) {
      setSaved([])
      setStoreError(error instanceof Error ? error.message : '후보를 읽지 못했습니다.')
    }
  }, [store, revision])
  useEffect(() => {
    const sync = () => setRevision((value) => value + 1)
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  useEffect(() => {
    setSelected(new Set())
    setPage(0)
  }, [mode, live, filters, topic, reviewman, sort, manual])
  const input: CandidateInput[] = useMemo(
    () =>
      mode === 'LIVE'
        ? (live?.data.rows.map((row) => ({
            ...row,
            collectedAt: live.data.volume.collectedAt,
            source: live.data.volume.source.label,
            mode: 'LIVE',
          })) ?? [])
        : mode === 'MANUAL'
          ? manual
          : keywords.map((row) => ({
              keyword: row.term,
              pc: null,
              mobile: null,
              total: row.monthlySearches,
              collectedAt: null,
              source: 'Phase 0 가상 예시',
              mode: 'DEMO',
            })),
    [mode, live, manual, keywords],
  )
  const context = useMemo(
    () => ({
      topic,
      reviewmanTopics: reviewman
        .split(/[,\n]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    }),
    [topic, reviewman],
  )
  const analyzed = useMemo(() => analyzeCandidates(input, context), [input, context])
  const result = useMemo(() => {
    try {
      return { rows: sortCandidates(applyCandidateFilters(analyzed, filters), sort), error: '' }
    } catch (error) {
      return { rows: [], error: error instanceof Error ? error.message : '범위를 확인하세요.' }
    }
  }, [analyzed, filters, sort])
  const summary = summarizeCandidates(result.rows),
    allSummary = summarizeCandidates(analyzed)
  const visible = result.rows.slice(page * 50, (page + 1) * 50),
    pageCount = Math.max(1, Math.ceil(result.rows.length / 50))
  function field(name: keyof CandidateFilters, value: string | boolean) {
    setFilters((current) => ({ ...current, [name]: value }))
  }
  function saveSelected() {
    try {
      const rows = result.rows.filter((row) => selected.has(row.key))
      if (!rows.length) return
      const status = store.save(rows, context, ideaId || null)
      setNotice(`${status.added}개 저장 · 중복 후보 ${status.duplicates}개는 덮어쓰지 않았습니다.`)
      setSelected(new Set())
      setRevision((value) => value + 1)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '저장 실패')
    }
  }
  function exportSaved() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: saved }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'prismkit-candidates.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section className="panel research-panel" aria-label="키워드 후보 선정">
      <div className="research-heading">
        <div>
          <div className="eyebrow">LOCAL CANDIDATE REVIEW</div>
          <h2>키워드 후보 선정</h2>
        </div>
        <span className="subtle-badge">{mode} · 로컬 규칙 분석</span>
      </div>
      <p>
        수신한 키워드 전체를 추가 API 호출 없이 분석합니다. 후보는 발행 확정이나 블로그 상위 노출
        보장이 아닙니다. 검색량은 출처 자료, 의도·관련성·우선순위는 규칙 기반 추정입니다.
      </p>
      <div className="idea-form">
        <label>
          후보 분석 데이터
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value as DataMode
              setMode(next)
              setTopic(next === 'LIVE' ? (live?.keyword ?? '') : '')
              setFilters({ ...emptyFilters })
              setNotice('')
            }}
          >
            <option value="DEMO">DEMO · 가상 예시</option>
            <option value="MANUAL">MANUAL · 저장한 수동 자료</option>
            <option value="LIVE">LIVE · 마지막 성공 조회 전체</option>
          </select>
        </label>
      </div>
      {mode === 'LIVE' && !live && (
        <p>
          위 검색광고 조회에서 사용자가 직접 조회한 뒤 선택하세요. 이 패널은 API를 호출하지
          않습니다.
        </p>
      )}
      {mode === 'LIVE' && live && (
        <p>
          LIVE 출처: {live.data.volume.source.label} · 수신 시각: {live.data.volume.collectedAt}
        </p>
      )}
      {mode === 'MANUAL' && (
        <>
          <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>
            수동 자료 다시 읽기
          </button>
          {loadError && <p role="alert">{loadError}</p>}
        </>
      )}
      <details open>
        <summary>필터·분류 설정</summary>
        <div className="idea-form">
          <div className="research-grid">
            <label>
              후보 핵심 주제
              <input
                value={topic}
                maxLength={60}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="예: 온누리상품권"
              />
            </label>
            <label>
              Reviewman 연결 가능 주제
              <input
                value={reviewman}
                maxLength={500}
                onChange={(event) => setReviewman(event.target.value)}
                placeholder="직접 확인한 주제만 쉼표로 구분"
              />
            </label>
          </div>
          <p className="form-note">
            연결 주제 일치는 검토용 추정이며 reviewman.kr의 실제 콘텐츠를 조회하지 않습니다. 연령
            가중치는 사용하지 않습니다.
          </p>
          <label>
            검색량 빠른 설정
            <select
              aria-label="검색량 빠른 설정"
              value={
                ['100', '500', '1000', '5000'].includes(filters.min) && filters.max === ''
                  ? filters.min
                  : 'custom'
              }
              onChange={(event) => {
                if (event.target.value === 'all')
                  setFilters((current) => ({ ...current, min: '', max: '' }))
                else if (event.target.value !== 'custom')
                  setFilters((current) => ({ ...current, min: event.target.value, max: '' }))
              }}
            >
              <option value="custom">사용자 지정 / 현재 범위</option>
              <option value="all">전체 검색량 제한 없음</option>
              {['100', '500', '1000', '5000'].map((value) => (
                <option value={value} key={value}>
                  {Number(value).toLocaleString()} 이상
                </option>
              ))}
            </select>
          </label>
          <div className="research-grid">
            {(
              [
                ['min', '전체 검색량 최소'],
                ['max', '전체 검색량 최대'],
                ['pcMin', 'PC 검색량 최소'],
                ['pcMax', 'PC 검색량 최대'],
                ['mobileMin', '모바일 검색량 최소'],
                ['mobileMax', '모바일 검색량 최대'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  inputMode="numeric"
                  value={filters[key]}
                  onChange={(event) => field(key, event.target.value)}
                  placeholder="제한 없음"
                />
              </label>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={filters.keepUnknown}
              onChange={(event) => field('keepUnknown', event.target.checked)}
            />{' '}
            범위값(&lt;10)·미확인 검색량도 별도 검토를 위해 표시
          </label>
          <div className="research-grid">
            <label>
              후보 검색 의도
              <select
                value={filters.intent}
                onChange={(event) => field('intent', event.target.value)}
              >
                <option value="all">모든 의도</option>
                {intents.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              후보 상태
              <select
                value={filters.status}
                onChange={(event) => field('status', event.target.value)}
              >
                <option value="all">모든 후보</option>
                {candidateStatuses.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              키워드 포함
              <input
                value={filters.include}
                onChange={(event) => field('include', event.target.value)}
              />
            </label>
            <label>
              키워드 제외어
              <input
                value={filters.exclude}
                onChange={(event) => field('exclude', event.target.value)}
                placeholder="쉼표 구분 · 제외 후보로 보존"
              />
            </label>
          </div>
          <button className="button secondary" onClick={() => setFilters({ ...emptyFilters })}>
            후보 필터 초기화
          </button>
        </div>
      </details>
      {result.error && <p role="alert">{result.error}</p>}
      <div className="candidate-summary" aria-label="후보 분석 요약">
        <p>
          전체 수집 {input.length}개 → 중복 제거 후 {analyzed.length}개 · 전체 검색량 확인 가능{' '}
          {allSummary.known}개
        </p>
        <p>
          현재 필터 적용: {summary.count}개 · 검색량 확인 가능 {summary.known}개 · 1차 검토 추천{' '}
          {summary.primary}개 · 롱테일 후보 {summary.longtail}개 · 추가 검증 필요 {summary.review}개
          · 제외 후보 {summary.excluded}개
        </p>
      </div>
      <p className="form-note">
        범위 밖 키워드는 숨겨질 뿐 삭제되지 않습니다. 제외어 일치는 숨기며 후보 상태에서 제외 후보를
        선택하면 다시 볼 수 있습니다. 미확인 수치 포함 설정은 숫자 범위를 충족했다는 뜻이 아닙니다.
        필터·분류 조건 변경 시 선택을 해제합니다.
      </p>
      <label>
        후보 정렬{' '}
        <select value={sort} onChange={(event) => setSort(event.target.value as CandidateSort)}>
          {(
            [
              ['priority', '1차 추천 우선순위'],
              ['total-desc', '전체 검색량 높은 순'],
              ['total-asc', '전체 검색량 낮은 순'],
              ['pc-desc', 'PC 검색량 높은 순'],
              ['mobile-desc', '모바일 검색량 높은 순'],
              ['name', '키워드 이름순'],
            ] as const
          ).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="candidate-actions">
        <button
          className="button secondary"
          disabled={!result.rows.length}
          onClick={() => setSelected(new Set(result.rows.map((row) => row.key)))}
        >
          필터 결과 전체 선택 ({result.rows.length})
        </button>
        <button className="button secondary" onClick={() => setSelected(new Set())}>
          선택 해제
        </button>
        <button
          className="button primary"
          disabled={!selected.size || !!storeError}
          onClick={saveSelected}
        >
          선택 후보 저장 ({selected.size})
        </button>
      </div>
      <div className="idea-form">
        <label>
          저장할 후보의 글감 연결
          <select value={ideaId} onChange={(event) => setIdeaId(event.target.value)}>
            <option value="">연결 없음</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>
                {idea.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="table-scroll">
        <table className="keyword-table">
          <thead>
            <tr>
              <th>선택</th>
              <th>키워드·출처</th>
              <th>PC</th>
              <th>모바일</th>
              <th>전체</th>
              <th>검색 의도·후보 상태</th>
              <th>분류 근거</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const duplicate = saved.some(
                (item) =>
                  normalizeKeyword(item.candidate.keyword) === normalizeKeyword(row.keyword),
              )
              const group = analyzed.filter((item) => item.group === row.group)
              return (
                <tr key={row.key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${row.keyword} 후보 선택`}
                      checked={selected.has(row.key)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (next.has(row.key)) next.delete(row.key)
                          else next.add(row.key)
                          return next
                        })
                      }
                    />
                  </td>
                  <td>
                    {row.keyword}
                    <small className="candidate-meta">
                      {row.mode} · {row.source}
                      <br />
                      {row.collectedAt ?? '확인 시각 없음'}
                    </small>
                    {duplicate && <span className="subtle-badge">중복 후보 주의</span>}
                  </td>
                  <td>{displayCount(row.pc)}</td>
                  <td>{displayCount(row.mobile)}</td>
                  <td>{displayCount(row.total)}</td>
                  <td>
                    {row.intent}
                    {row.review && <small className="candidate-meta">검토 필요</small>}
                    <br />
                    {row.status}
                  </td>
                  <td>
                    <details>
                      <summary>근거·그룹 보기</summary>
                      <ul>
                        {row.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <p>
                        유사 표현 그룹(추정): {group.map((item) => item.keyword).join(', ')} ·{' '}
                        {group.length}개. 별도 후보로 유지합니다.
                      </p>
                      <p>
                        같은 의도 {analyzed.filter((item) => item.intent === row.intent).length}개:
                        의도 필터로 묶어 볼 수 있습니다.
                      </p>
                      <p>원문: {row.originals.map((item) => item.keyword).join(' / ')}</p>
                    </details>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!result.rows.length && <p>표시할 후보가 없습니다. 데이터 또는 필터를 확인하세요.</p>}
      <div className="candidate-actions">
        <button
          className="button secondary"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          이전 후보
        </button>
        <span>
          {page + 1} / {pageCount} 페이지 · 페이지당 50개
        </span>
        <button
          className="button secondary"
          disabled={page + 1 >= pageCount}
          onClick={() => setPage((value) => value + 1)}
        >
          다음 후보
        </button>
      </div>
      <h3>저장한 후보 ({saved.length})</h3>
      <p>
        선택한 후보만 현재 브라우저에 저장합니다. 저장 당시 출처·시각·규칙 버전과 연결 글감을
        보존하며, 수치가 자동 갱신되지는 않습니다.
      </p>
      {storeError ? (
        <div role="alert">
          {storeError}
          <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>
            후보 저장소 다시 읽기
          </button>
        </div>
      ) : (
        <>
          <button className="button secondary" disabled={!saved.length} onClick={exportSaved}>
            후보 JSON 내보내기
          </button>
          <div className="research-grid">
            {saved.map((item) => (
              <article key={item.id} aria-label={`${item.candidate.keyword} 저장 후보`}>
                <h4>{item.candidate.keyword}</h4>
                <p>
                  {item.candidate.mode} · {item.candidate.intent} · {item.candidate.status}
                </p>
                <p>
                  {item.candidate.source} · 확인: {item.candidate.collectedAt ?? '확인 불가'} ·
                  저장: {new Date(item.savedAt).toLocaleString('ko-KR')}
                </p>
                <p>전체 검색량: {displayCount(item.candidate.total)} · rules-v1</p>
                <label>
                  저장 후보 글감 연결
                  <select
                    aria-label={`${item.candidate.keyword} 연결 글감`}
                    value={item.ideaId ?? ''}
                    onChange={(event) => {
                      try {
                        store.link(item.id, event.target.value || null)
                        setRevision((value) => value + 1)
                      } catch (error) {
                        setNotice(error instanceof Error ? error.message : '연결 실패')
                      }
                    }}
                  >
                    <option value="">연결 없음</option>
                    {item.ideaId && !ideas.some((idea) => idea.id === item.ideaId) && (
                      <option value={item.ideaId}>삭제된 글감 · 연결 해제 가능</option>
                    )}
                    {ideas.map((idea) => (
                      <option key={idea.id} value={idea.id}>
                        {idea.title}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
