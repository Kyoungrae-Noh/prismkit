import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { createCandidateStore, type SavedCandidate } from '../data/candidate-store'
import { createCaptureStore } from '../data/capture-store'
import { createPublishingStore } from '../data/publishing-store'
import { createManuscriptStore } from '../data/manuscript-store'
import { workspaceStorage } from '../data/storage'
import { createResearchStore } from '../data/research-store'
import { defaultRanking, rankCandidates } from '../domain/ranking'
import {
  DRAFT_MODEL,
  draftAccounts,
  reviewCategories,
  draftReviewLabels,
  qualityIssues,
  draftMarkdown,
  draftHTML,
  validateBrief,
  type DraftBrief,
  type Manuscript,
  type DraftContent,
  type DraftStatus,
} from '../domain/manuscripts'
import { fetchDraftStatus, requestDraft } from '../providers/draft-client'
const FORM_KEY = 'prismkit.manuscript-brief.v1'
const blank: DraftBrief = {
  candidateId: '',
  ideaId: null,
  keyword: '',
  topic: '',
  intent: '',
  type: 'naver',
  account: 'nkr09134',
  category: 'lifestyle',
  angle: '',
  evidence: '',
  sources: [],
}
export function ManuscriptsPage() {
  const { ideas } = useWorkspace(),
    [params] = useSearchParams(),
    store = createManuscriptStore(localStorage)
  const [brief, setBrief] = useState<DraftBrief>(blank),
    [candidates, setCandidates] = useState<SavedCandidate[]>([]),
    [rows, setRows] = useState<Manuscript[]>([]),
    [current, setCurrent] = useState<Manuscript | null>(null)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [statusError, setStatusError] = useState(''),
    [status, setStatus] = useState<DraftStatus | null>(null),
    [consent, setConsent] = useState(false),
    [assessment, setAssessment] = useState<string[]>([])
  const expected = useRef<string | undefined>(undefined),
    running = useRef(false),
    checkingRef = useRef(false),
    loaded = useRef(false)
  function patchBrief(p: Partial<DraftBrief>) {
    const next = { ...brief, ...p }
    setBrief(next)
    try {
      workspaceStorage(localStorage).setItem(FORM_KEY, JSON.stringify(next))
    } catch {
      setError('입력 저장 실패: 입력을 복사해 보관하세요.')
    }
  }
  async function selectCandidate(id: string, list = candidates) {
    const c = list.find((x) => x.id === id)
    if (!c) return
    try {
      const capture = createCaptureStore(localStorage).read(),
        pub = createPublishingStore(localStorage).read(),
        research = await createResearchStore(localStorage).listResearch()
      const ranked = rankCandidates(list, ideas, research, pub, capture, defaultRanking).find(
        (r) => r.id === id,
      )
      const d = capture.drafts.find(
        (x) => x.ideaId === c.ideaId && c.ideaId !== null && x.confirmed,
      )
      const a = pub.analyses.find((x) => x.candidateId === id)
      const evidence = [
        `검색량 ${c.candidate.mode}: PC ${c.candidate.pc ?? '미확인'} / 모바일 ${c.candidate.mobile ?? '미확인'} / 합계 ${c.candidate.total ?? '미확인'}; ${c.candidate.source}; ${c.candidate.collectedAt ?? '시각 미확인'}`,
        `경쟁 문서 수: ${ranked?.documents?.count ?? '미확인'}`,
        d
          ? `사용자 승인 캡처 인용: ${d.ai?.evidence ?? d.summary}\n추가 확인: ${d.uncertain}`
          : '캡처 근거 미연결',
        a
          ? `차별화: ${a.missingInfo}\n경쟁 관찰: ${a.posts.map((p) => p.features).join('; ')}`
          : '경쟁 분석 미확인',
      ]
        .join('\n')
        .slice(0, 5000)
      patchBrief({
        candidateId: id,
        ideaId: c.ideaId,
        keyword: c.candidate.keyword,
        topic:
          ideas.find((i) => i.id === c.ideaId)?.title ?? c.context.topic ?? c.candidate.keyword,
        intent: d?.intent || ranked?.intent || '사용자 확인 필요',
        evidence,
        sources: [],
      })
      setAssessment(
        ranked ? [ranked.status, ...ranked.missing, ...ranked.reasons] : ['발행 평가 근거 미확인'],
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    try {
      const list = createCandidateStore(localStorage)
        .list()
        .filter((x) => x.candidate.mode !== 'DEMO')
      setCandidates(list)
      setRows(store.read())
      const raw = workspaceStorage(localStorage).getItem(FORM_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sources))
          setBrief({ ...blank, ...parsed })
      }
      loaded.current = true
      const id = params.get('candidate')
      if (id) void selectCandidate(id, list)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  async function check() {
    if (checkingRef.current || running.current) return
    checkingRef.current = true
    setChecking(true)
    setStatus(null)
    setStatusError('')
    try {
      setStatus(await fetchDraftStatus())
    } catch (e) {
      setStatusError((e as Error).message)
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }
  function save(m: Manuscript) {
    setCurrent(m)
    try {
      setRows(store.save(m, expected.current))
      expected.current = JSON.stringify(m)
      setNotice('원고 자동 저장 완료')
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  function edit(p: Partial<DraftContent>) {
    if (current)
      save({
        ...current,
        content: { ...current.content, ...p },
        review: {},
        updatedAt: new Date().toISOString(),
      })
  }
  async function generate() {
    if (
      running.current ||
      checkingRef.current ||
      !consent ||
      !status?.connected ||
      status.blocked ||
      !status.remaining
    )
      return
    running.current = true
    setBusy(true)
    setError('')
    try {
      const input = validateBrief(brief)
      if (!candidates.some((x) => x.id === input.candidateId))
        throw Error('저장된 실제·수동 후보를 선택하세요.')
      const m = await requestDraft(input, crypto.randomUUID())
      expected.current = undefined
      save(m)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      running.current = false
      setBusy(false)
      await check()
    }
  }
  function download(kind: 'md' | 'html') {
    if (!current) return
    const url = URL.createObjectURL(
      new Blob([kind === 'md' ? draftMarkdown(current) : draftHTML(current)], {
        type: kind === 'md' ? 'text/markdown;charset=utf-8' : 'text/html;charset=utf-8',
      }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `prismkit-${current.brief.type}-${current.brief.account}-${current.id}.${kind}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const field = (label: string, value: string, change: (v: string) => void, rows = 3) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        rows={rows}
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  )
  const issues = current
    ? qualityIssues(
        current,
        rows.filter((x) => x.id !== current.id),
      )
    : []
  return (
    <div className="manuscripts-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DRAFT STUDIO</div>
          <h1>원고 작업실</h1>
          <p>근거를 확인하고 원고를 만들고 다듬으세요. 실제 발행은 직접 진행합니다.</p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="panel research-panel">
        <h2>1. 발행 후보와 작성 근거</h2>
        <fieldset disabled={busy} className="idea-form">
          <label>
            발행 후보
            <select
              aria-label="발행 후보"
              value={brief.candidateId}
              onChange={(e) => void selectCandidate(e.target.value)}
            >
              <option value="">후보 선택</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.candidate.keyword} · {c.candidate.mode}
                </option>
              ))}
            </select>
          </label>
          {!candidates.length && (
            <p>
              <Link to="/keywords">키워드 분석에서 실제·수동 후보를 저장하세요.</Link>
            </p>
          )}
          {assessment.length > 0 && (
            <details open>
              <summary>발행 판단 근거</summary>
              <ul>
                {assessment.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="capture-filters">
            <label>
              원고 유형
              <select
                aria-label="원고 유형"
                value={brief.type}
                onChange={(e) => patchBrief({ type: e.target.value as DraftBrief['type'] })}
              >
                <option value="naver">네이버 블로그</option>
                <option value="reviewman">Reviewman</option>
              </select>
            </label>
            <label>
              블로그 계정
              <select
                aria-label="블로그 계정"
                value={brief.account}
                onChange={(e) => patchBrief({ account: e.target.value })}
              >
                {draftAccounts.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              Reviewman 카테고리
              <select
                aria-label="Reviewman 카테고리"
                value={brief.category}
                onChange={(e) => patchBrief({ category: e.target.value })}
              >
                {reviewCategories.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          {field('주제', brief.topic, (v) => patchBrief({ topic: v }), 1)}
          {field('검색 의도', brief.intent, (v) => patchBrief({ intent: v }), 1)}
          {field('계정별 독자·차별화 방향', brief.angle, (v) => patchBrief({ angle: v }))}
          {field(
            '확인된 자료와 미확인 사항',
            brief.evidence,
            (v) => patchBrief({ evidence: v }),
            5,
          )}
          <p>
            출처를 직접 열어 내용과 확인 날짜를 입력하세요. 링크는 자동 검증되지 않으며, 추가한
            링크만 원고에 사용할 수 있습니다. 미확인 정보는 빈칸 또는 확인 필요로 남깁니다.
          </p>
          {brief.sources.map((s, i) => {
            const update = (p: Partial<typeof s>) =>
              patchBrief({ sources: brief.sources.map((x, j) => (j === i ? { ...s, ...p } : x)) })
            return (
              <fieldset key={s.id}>
                <legend>근거 {i + 1}</legend>
                <label>
                  근거 유형
                  <select
                    aria-label="근거 유형"
                    value={s.kind}
                    onChange={(e) => update({ kind: e.target.value as typeof s.kind })}
                  >
                    <option value="official">사용자가 확인한 공식 자료</option>
                    <option value="internal">Reviewman 관련 콘텐츠</option>
                  </select>
                </label>
                {field('자료 제목', s.title, (v) => update({ title: v }), 1)}
                {field('확인한 HTTPS URL', s.url, (v) => update({ url: v }), 1)}
                {field('원문에서 확인한 사실', s.excerpt, (v) => update({ excerpt: v }))}
                <label>
                  자료 확인 날짜
                  <input
                    type="date"
                    value={s.checkedDate}
                    onChange={(e) => update({ checkedDate: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => patchBrief({ sources: brief.sources.filter((_, j) => i !== j) })}
                >
                  근거 제거
                </button>
              </fieldset>
            )
          })}
          <button
            className="button secondary"
            disabled={brief.sources.length >= 10}
            onClick={() =>
              patchBrief({
                sources: [
                  ...brief.sources,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    url: '',
                    excerpt: '',
                    checkedDate: '',
                    kind: 'official',
                  },
                ],
              })
            }
          >
            작성 근거 추가
          </button>
        </fieldset>
      </section>
      <section className="panel research-panel">
        <h2>2. 원고 생성</h2>
        <p>
          {DRAFT_MODEL} · 입력 4,000 / 출력 6,000토큰 예시 약 $0.0112. 1회 $0.03 예약 · 일 5회/$0.15
          · 월 $1.50. 실패도 예약량 유지. 이미지 판독과 별도이며 실제 청구 상한을 보장하지 않습니다.
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={busy || checking}
          onClick={() => void check()}
        >
          {checking ? '원고 상태 조회 중…' : '원고 연결 상태 확인'}
        </button>
        <div aria-live="polite" aria-atomic="true">
          <p>
            {checking
              ? '서버의 원고 승인·예산 상태를 조회하고 있습니다.'
              : status
                ? !status.connected
                  ? '조회 완료 · 서버 응답 정상 · 원고 생성 비활성'
                  : status.blocked
                    ? '조회 완료 · 원고 생성 차단 · 관리자 확인 필요'
                    : !status.remaining
                      ? '조회 완료 · 원고 일일 또는 월간 한도 소진'
                      : '조회 완료 · 원고 생성 연결됨'
                : statusError
                  ? '원고 상태 조회 실패'
                  : '원고 연결 확인 필요'}
          </p>
          {status && !status.connected && (
            <p>
              원고 생성은 별도 비용 승인과 서버 설정이 필요합니다. 승인 대기·만료 또는 API 키 미설정
              상태에서는 생성할 수 없습니다. 이미지 판독의 활성화와는 별개입니다.
            </p>
          )}
        </div>
        {statusError && <p role="alert">{statusError}</p>}
        <p>
          생성 가능 {status?.remaining ?? '미확인'}회 · 오늘 {status?.used ?? '미확인'} / 5 · 이번
          달 {status?.monthUsed ?? '미확인'} / 50 · 월 예약 $
          {status?.reservedUsd?.toFixed(2) ?? '미확인'} · 응답 토큰 추정액 $
          {status?.estimatedUsd?.toFixed(5) ?? '미확인'}
        </p>
        <label>
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
          />
          개인정보를 확인했으며 작성 근거를 OpenAI로 전송하고 승인된 원고 비용을 사용하는 데
          동의합니다.
        </label>
        <button
          className="button primary"
          disabled={
            busy ||
            checking ||
            !status?.connected ||
            status.blocked ||
            !status.remaining ||
            !consent ||
            !brief.candidateId ||
            !loaded.current
          }
          onClick={() => void generate()}
        >
          {busy ? '원고 생성 중…' : 'AI 원고 생성'}
        </button>
        <p>
          버튼을 누를 때만 1회 요청합니다. 429·시간 초과를 자동 재시도하지 않습니다. 생성 결과는
          미검증 초안이며 자동 발행되지 않습니다.
        </p>
      </section>
      <section className="panel research-panel">
        <h2>생성 이력 {rows.length}개</h2>
        <div className="draft-history">
          {rows.map((m) => (
            <button
              className="button secondary"
              key={m.id}
              disabled={busy}
              onClick={() => {
                setCurrent(structuredClone(m))
                expected.current = JSON.stringify(m)
                setError('')
              }}
            >
              {m.content.title} ·{' '}
              {m.brief.type === 'naver' ? m.brief.account : 'Reviewman / ' + m.brief.category} ·{' '}
              {new Date(m.createdAt).toLocaleString('ko-KR')}
            </button>
          ))}
        </div>
      </section>
      {current && (
        <section className="panel research-panel" aria-label="원고 편집">
          <h2>3. 원고 편집·검토</h2>
          <p>
            {current.brief.keyword} · {current.brief.type} · {current.brief.account} ·{' '}
            {current.model} · 입력 {current.usage?.inputTokens ?? '미확인'} / 출력{' '}
            {current.usage?.outputTokens ?? '미확인'}토큰
          </p>
          {!candidates.some((c) => c.id === current.brief.candidateId) && (
            <p role="alert">
              연결 후보가 현재 저장소에 없습니다. 생성 당시 근거는 원고에 보존됩니다.
            </p>
          )}
          <div className="idea-form">
            {field('원고 제목', current.content.title, (v) => edit({ title: v }), 1)}
            {current.brief.type === 'reviewman' && (
              <>
                {field('Meta description', current.content.meta, (v) => edit({ meta: v }), 2)}
                {field('H1', current.content.h1, (v) => edit({ h1: v }), 1)}
              </>
            )}
            {field('도입부·핵심 정보 요약', current.content.introduction, (v) =>
              edit({ introduction: v }),
            )}
            {current.content.sections.map((s, i) => (
              <fieldset key={i}>
                <legend>본문 {i + 1}</legend>
                {field(
                  `소제목 ${i + 1}`,
                  s.heading,
                  (v) =>
                    edit({
                      sections: current.content.sections.map((x, j) =>
                        j === i ? { ...x, heading: v } : x,
                      ),
                    }),
                  1,
                )}
                {field(
                  `본문 ${i + 1}`,
                  s.body,
                  (v) =>
                    edit({
                      sections: current.content.sections.map((x, j) =>
                        j === i ? { ...x, body: v } : x,
                      ),
                    }),
                  7,
                )}
                <p>
                  근거:{' '}
                  {s.sourceIds
                    .map((id) => current.brief.sources.find((x) => x.id === id)?.title)
                    .join(', ') || '미확인'}
                </p>
              </fieldset>
            ))}
            {current.content.faq.map((f, i) => (
              <fieldset key={i}>
                <legend>FAQ {i + 1}</legend>
                {field(
                  `FAQ 질문 ${i + 1}`,
                  f.question,
                  (v) =>
                    edit({
                      faq: current.content.faq.map((x, j) => (i === j ? { ...x, question: v } : x)),
                    }),
                  1,
                )}
                {field(`FAQ 답변 ${i + 1}`, f.answer, (v) =>
                  edit({
                    faq: current.content.faq.map((x, j) => (i === j ? { ...x, answer: v } : x)),
                  }),
                )}
              </fieldset>
            ))}
            {field('마무리', current.content.conclusion, (v) => edit({ conclusion: v }))}
            {field('체크리스트 (줄마다 한 항목)', current.content.checklist.join('\n'), (v) =>
              edit({ checklist: v.split('\n') }),
            )}
            {current.content.imageNotes.map((x, i) => (
              <div key={i}>
                {field(
                  `이미지 ${i + 1} 위치·설명`,
                  x,
                  (v) =>
                    edit({
                      imageNotes: current.content.imageNotes.map((a, j) => (j === i ? v : a)),
                    }),
                  1,
                )}
              </div>
            ))}
            {field('CTA 배치 제안', current.content.cta, (v) => edit({ cta: v }))}
            {field('광고·제휴 유형 제안', current.content.monetization, (v) =>
              edit({ monetization: v }),
            )}
            <button className="button secondary" onClick={() => save(current)}>
              원고 저장 재시도
            </button>
          </div>
          <details>
            <summary>생성 당시 원문·근거 보기</summary>
            <pre className="draft-preview">
              {draftMarkdown({ ...current, content: current.generated })}
            </pre>
            <pre className="draft-preview">{current.brief.evidence}</pre>
          </details>
          <h3>발행 전 확인 사항</h3>
          <ul>
            {issues.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          {current.brief.sources.map((s) => (
            <p key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>{' '}
              · {s.checkedDate} · {s.excerpt}
            </p>
          ))}
          {Object.entries(draftReviewLabels).map(([key, label]) => (
            <label className="draft-check" key={key}>
              <input
                type="checkbox"
                checked={!!current.review[key]}
                onChange={(e) =>
                  save({
                    ...current,
                    review: { ...current.review, [key]: e.target.checked },
                    updatedAt: new Date().toISOString(),
                  })
                }
              />
              {label}
            </label>
          ))}
          <p>
            체크리스트 완료는 발행 확정이나 사실 보증이 아닙니다. 내용 수정 시 검토 체크가
            해제됩니다.
          </p>
          <h3>원고 미리보기</h3>
          <article className={`manuscript-preview ${current.brief.type}`}>
            <h1>
              {current.brief.type === 'reviewman' ? current.content.h1 : current.content.title}
            </h1>
            {current.brief.type === 'reviewman' && <p>Meta description: {current.content.meta}</p>}
            <p>{current.content.introduction}</p>
            {current.content.sections.map((s, i) => (
              <section key={i}>
                <h2>
                  {current.brief.type === 'naver' ? '│ ' : ''}
                  {s.heading}
                </h2>
                <p>{s.body}</p>
                {current.content.imageNotes[i] && (
                  <aside>
                    [이미지 {i + 1}: {current.content.imageNotes[i]}]
                  </aside>
                )}
              </section>
            ))}
            <h2>FAQ</h2>
            {current.content.faq.map((f, i) => (
              <section key={i}>
                <h3>{f.question}</h3>
                <p>{f.answer}</p>
              </section>
            ))}
            {current.content.imageNotes.slice(current.content.sections.length).map((x, i) => (
              <aside key={i}>
                [이미지 {current.content.sections.length + i + 1}: {x}]
              </aside>
            ))}
            <h2>체크리스트</h2>
            <ul>
              {current.content.checklist.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            <p>{current.content.conclusion}</p>
          </article>
          <div className="capture-actions">
            <button
              className="button primary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(draftMarkdown(current))
                  .then(() => setNotice('원고 복사 완료'))
                  .catch(() => setError('복사 권한 오류: Markdown 파일로 내려받으세요.'))
              }
            >
              원고 복사
            </button>
            <button className="button secondary" onClick={() => download('md')}>
              Markdown 내보내기
            </button>
            <button className="button secondary" onClick={() => download('html')}>
              HTML 내보내기
            </button>
            <Link to="/backup">전체 JSON 백업</Link>
          </div>
          <p>
            HTML은 네이버 소제목 30pt·굵게, 본문 19pt 스타일을 포함합니다. 붙여넣은 뒤 블로그
            편집기에서 서식을 확인하세요. 검토 메모는 발행 전에 제거하세요.
          </p>
        </section>
      )}
    </div>
  )
}
