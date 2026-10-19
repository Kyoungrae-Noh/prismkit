import { useEffect, useMemo, useState } from 'react'
import { normalizeKeyword } from '../domain/candidates'
import { useWorkspace } from '../app/workspace'
import { Link, useSearchParams } from 'react-router-dom'
import { createCandidateStore, type SavedCandidate } from '../data/candidate-store'
import {
  createPublishingStore,
  parsePublishingImport,
  STORAGE_BYTES,
} from '../data/publishing-store'
import { validateImagePreview } from '../data/evidence'
import {
  accounts,
  duplicateWarnings,
  emptyPublishing,
  naverSearch,
  publishingDecision,
  publicationLabels,
  type PublishingData,
  type Publication,
} from '../domain/publishing'
import { CompetitionForm } from '../components/competition-form'
import { PublicationForm } from '../components/publication-form'
const count = (value: unknown) => (value === null ? '확인 불가' : String(value))
export function Publishing() {
  const { ideas } = useWorkspace()
  const store = useMemo(() => createPublishingStore(localStorage), []),
    [data, setData] = useState<PublishingData>(emptyPublishing),
    [candidates, setCandidates] = useState<SavedCandidate[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(false),
    [publication, setPublication] = useState<Publication | null>(null),
    [params, setParams] = useSearchParams()
  const refresh = () => {
    try {
      setData(store.read())
      setCandidates(createCandidateStore(localStorage).list())
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    refresh()
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [store]) // storage changes from another tab
  const selected = candidates.find((c) => c.id === params.get('candidate')),
    record = data.analyses.find((a) => a.candidateId === selected?.id),
    decision = selected
      ? publishingDecision(selected, record, data, record?.reviewmanUrl ?? '')
      : null
  const newPublication = () =>
    setPublication({
      id: crypto.randomUUID(),
      account: 'nkr09134',
      keyword: selected?.candidate.keyword ?? '',
      topic: selected?.context.topic ?? '',
      title: '',
      status: 'planned',
      date: '',
      blogUrl: '',
      reviewmanUrl: record?.reviewmanUrl ?? '',
      ideaId: selected?.ideaId ?? null,
    })
  return (
    <div className="publishing-page">
      <header className="page-heading">
        <div>
          <h1>경쟁 분석 · 발행 판단</h1>
          <p>수동 근거 기반 실험용 평가입니다. 검색 노출·수익을 보장하지 않습니다.</p>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="research-panel">
        <h2>후보 비교</h2>
        <p>
          저장 후보의 검색량을 재사용합니다. 추가 API 호출 없이 비교합니다.{' '}
          <Link to="/keywords">키워드 후보 관리</Link>
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>키워드</th>
                <th>PC / 모바일</th>
                <th>경쟁 상태</th>
                <th>발행 판단</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const a = data.analyses.find((a) => a.candidateId === c.id),
                  d = publishingDecision(c, a, data, a?.reviewmanUrl ?? '')
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => setParams({ candidate: c.id })}
                      >
                        {c.candidate.keyword}
                      </button>
                      <small> {c.candidate.mode}</small>
                    </td>
                    <td>
                      {count(c.candidate.pc)} / {count(c.candidate.mobile)}
                    </td>
                    <td>{d.competition.status}</td>
                    <td>{d.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!candidates.length && <p>키워드 분석에서 후보를 먼저 저장하세요.</p>}
      </section>
      {selected && decision && (
        <section className="research-panel" aria-label="통합 발행 판단">
          <h2>{selected.candidate.keyword}</h2>
          <p>
            {selected.candidate.mode} · PC {count(selected.candidate.pc)} / 모바일{' '}
            {count(selected.candidate.mobile)} / 전체 {count(selected.candidate.total)}
          </p>
          <p>
            검색량 출처: {selected.candidate.source} · 확인:{' '}
            {selected.candidate.collectedAt ?? '확인 불가'}
          </p>
          <p>
            검색 의도: {selected.candidate.intent}
            {selected.candidate.review ? ' · 검토 필요' : ''}
          </p>
          <p>
            관련 글감:{' '}
            {ideas.find((idea) => idea.id === selected.ideaId)?.title ??
              (selected.ideaId ? '연결된 글감을 찾을 수 없음' : '연결 없음')}
          </p>
          <p>
            관련 저장 롱테일:{' '}
            {candidates
              .filter(
                (c) =>
                  c.id !== selected.id &&
                  c.context.topic === selected.context.topic &&
                  c.candidate.status === '롱테일 후보',
              )
              .map((c) => c.candidate.keyword)
              .join(', ') || '확인된 후보 없음'}
          </p>
          <div className="candidate-actions">
            <a
              className="button"
              href={naverSearch(selected.candidate.keyword)}
              target="_blank"
              rel="noreferrer"
            >
              네이버 검색 바로가기
            </a>
            <button className="button primary" onClick={() => setEditing(true)}>
              경쟁 자료 입력·수정
            </button>
            <button className="button" onClick={newPublication}>
              이 후보 발행 계획 등록
            </button>
          </div>
          <h3>경쟁 분석: {decision.competition.status}</h3>
          <p>
            MANUAL · 검색 확인: {record?.checkedDate || '확인 불가'} · 캡처{' '}
            {record?.images.length ?? 0}장 (AI 판독 미실시)
          </p>
          <p>
            사용자 확인 결과 수: {record?.total ?? '확인 불가'} · 결과 수만으로 경쟁을 판단하지
            않습니다.
          </p>
          <ul>
            {decision.competition.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {decision.competition.missing.length > 0 && (
            <details open>
              <summary>추가 확인 필요 {decision.competition.missing.length}개</summary>
              <ul>
                {decision.competition.missing.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          )}
          <h3>최종 판단: {decision.status}</h3>
          <ul>
            {decision.reasons
              .filter((r) => !decision.competition.missing.includes(r))
              .map((r, i) => (
                <li key={i}>{r}</li>
              ))}
          </ul>
          <p>
            Reviewman 연계:{' '}
            {record?.reviewmanUrl ? (
              <a href={record.reviewmanUrl} target="_blank" rel="noreferrer">
                입력한 연결 페이지
              </a>
            ) : (
              '연결 근거 필요'
            )}{' '}
            · 수익성 검증 미실시
          </p>
          <p>
            추천 계정: {decision.account.account ?? '확정하지 않음'} · {decision.account.reason}
          </p>
          <h3>중복 경고 · 기존 이력</h3>
          {decision.duplicates.length ? (
            <ul>
              {decision.duplicates.map((w, i) => (
                <li key={i}>
                  {w.account}: {w.message} —{' '}
                  {data.publications.find((p) => p.id === w.publicationId)?.title}
                </li>
              ))}
            </ul>
          ) : (
            <p>등록된 이력에서 중복을 찾지 못했습니다. 미등록 이력까지 확인한 것은 아닙니다.</p>
          )}
        </section>
      )}
      <section className="research-panel">
        <h2>3개 블로그 계정 이력</h2>
        <p>
          실제 이력은 직접 등록하세요. 각 계정의 이력을 확인했을 때만 아래 항목을 선택하세요. 관련
          주제 근거가 없거나 동률이면 계정을 추천하지 않습니다.
        </p>
        <div className="research-grid">
          {accounts.map((account) => (
            <article key={account}>
              <h3>{account}</h3>
              <p>
                {Object.entries(publicationLabels)
                  .map(
                    ([state, label]) =>
                      `${label} ${data.publications.filter((p) => p.account === account && p.status === state).length}`,
                  )
                  .join(' · ')}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={data.historyChecked[account]}
                  onChange={(e) => {
                    try {
                      store.setHistoryChecked(account, e.target.checked)
                      refresh()
                    } catch (e) {
                      setError((e as Error).message)
                    }
                  }}
                />
                {account} 이력 확인 완료
              </label>
            </article>
          ))}
        </div>
        <div className="candidate-actions">
          <button className="button" onClick={newPublication}>
            발행 이력 추가
          </button>
          <button
            className="button"
            onClick={() => {
              try {
                const blob = new Blob([JSON.stringify(store.read(), null, 2)], {
                    type: 'application/json',
                  }),
                  url = URL.createObjectURL(blob),
                  a = document.createElement('a')
                a.href = url
                a.download = 'prismkit-publishing.json'
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            발행 자료 JSON 내보내기
          </button>
          <label className="button">
            발행 자료 JSON 가져오기
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  if (file.size > STORAGE_BYTES)
                    throw new Error('가져올 파일은 4 MiB 이하여야 합니다.')
                  const incoming = parsePublishingImport(await file.text())
                  for (const a of incoming.analyses) {
                    const linked = candidates.find((c) => c.id === a.candidateId)
                    if (
                      linked &&
                      normalizeKeyword(linked.candidate.keyword) !== normalizeKeyword(a.keyword)
                    )
                      throw new Error('분석 자료의 후보 ID와 키워드가 일치하지 않습니다.')
                    for (const image of a.images) await validateImagePreview(image)
                  }
                  const result = store.importData(incoming)
                  refresh()
                  setNotice(
                    `${result.added}개 추가, ${result.skipped}개 동일 자료 유지. 계정 이력 확인 여부는 직접 확인하세요.`,
                  )
                } catch (e) {
                  setError((e as Error).message)
                }
              }}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>계정 / 키워드</th>
                <th>글 제목</th>
                <th>상태 / 발행일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {data.publications.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.account}
                    <br />
                    {p.keyword}
                    {duplicateWarnings(
                      p.keyword,
                      p.topic,
                      p.reviewmanUrl,
                      data.publications.filter((other) => other.id !== p.id),
                    ).map((w, i) => (
                      <p key={i}>
                        {w.account}: {w.message}
                      </p>
                    ))}
                  </td>
                  <td>
                    {p.title}
                    {p.blogUrl && (
                      <a href={p.blogUrl} target="_blank" rel="noreferrer">
                        {' '}
                        · 블로그 글
                      </a>
                    )}
                    {p.reviewmanUrl && (
                      <a href={p.reviewmanUrl} target="_blank" rel="noreferrer">
                        {' '}
                        · Reviewman
                      </a>
                    )}
                  </td>
                  <td>
                    {publicationLabels[p.status]} / {p.date || '미발행'}
                  </td>
                  <td>
                    <button className="button" onClick={() => setPublication(p)}>
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.publications.length && <p>등록된 발행 이력이 없습니다.</p>}
        {data.analyses.some((a) => !candidates.some((c) => c.id === a.candidateId)) && (
          <p>
            현재 후보 목록에 없는 분석 자료도 보존 중입니다. 원래 브라우저의 후보 자료와 함께
            관리하세요.
          </p>
        )}
      </section>
      {editing && selected && (
        <CompetitionForm
          candidate={selected}
          record={record}
          onClose={() => setEditing(false)}
          onSave={(value) => {
            store.saveCompetition(value)
            refresh()
            setEditing(false)
          }}
        />
      )}
      {publication && (
        <PublicationForm
          initial={publication}
          onClose={() => setPublication(null)}
          onSave={(value) => {
            store.savePublication(value)
            refresh()
            setPublication(null)
          }}
        />
      )}
    </div>
  )
}
