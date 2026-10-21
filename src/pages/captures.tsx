import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { categories } from '../domain/models'
import {
  duplicateDrafts,
  emptyCaptures,
  newDraft,
  type CaptureData,
  type CaptureDraft,
  type CaptureImage,
} from '../domain/captures'
import { createCaptureStore, linkCaptureIdea } from '../data/capture-store'
import { blobDataUrl, imageVault } from '../data/capture-images'
import { AICaptures } from '../components/ai-captures'
import { createCaptureQueue } from '../data/capture-queue'
import { pastedImages, transferFiles } from '../data/capture-input'

function CapturePreview({ image }: { image: CaptureImage }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    imageVault
      .get(image.id)
      .then(blobDataUrl)
      .then((s) => {
        if (active) setUrl(s)
      })
      .catch(() => {
        if (active) setError('원본 읽기 실패: 전체 백업을 확인하세요.')
      })
    return () => {
      active = false
    }
  }, [image.id])
  return url ? (
    <>
      <img className="capture-preview" src={url} alt={image.name} />
      <a className="text-link" href={url} download={image.name}>
        원본 내려받아 확인
      </a>
    </>
  ) : (
    <p>{error || '미리보기 준비 중…'}</p>
  )
}
export function CapturesPage() {
  const { ideas, refresh } = useWorkspace()
  const store = createCaptureStore(localStorage)
  const [data, setData] = useState<CaptureData>(emptyCaptures),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState<File[]>([]),
    [editing, setEditing] = useState<CaptureDraft | null>(null),
    [deleting, setDeleting] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false),
    [approveAll, setApproveAll] = useState(false)
  const [deletingDraft, setDeletingDraft] = useState<string | null>(null)
  const queue = useRef<ReturnType<typeof createCaptureQueue> | null>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  function reload() {
    try {
      setData(store.read())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '캡처 저장소 읽기 실패')
    }
  }
  useEffect(() => {
    reload()
    const onStorage = () => reload()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  function save(next: CaptureData) {
    if (JSON.stringify(store.read()) !== JSON.stringify(data))
      throw new Error('자료가 다른 탭에서 변경되었습니다. 다시 불러온 뒤 시도하세요.')
    store.write(next)
    setApproveAll(false)
    setData(next)
    setError('')
  }
  function action(fn: () => void) {
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    }
  }
  function upload(files: File[]) {
    try {
      const accepted = queue.current?.enqueue(files) ?? false
      if (accepted) setError('')
      return accepted
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 추가 실패')
      return false
    }
  }
  useEffect(() => {
    const inbox = createCaptureQueue({
      store,
      progress: (pending) => {
        setBusy(true)
        setFailed([])
        setMessage(`이미지 처리 중 · 대기 포함 ${pending}장`)
      },
      saved: setData,
      complete: ({ added, failed: failures, notes }) => {
        setBusy(false)
        setFailed(failures)
        const status = added
          ? `로컬 보관 완료: ${added}장. 이미지 추가 완료.`
          : failures.length
            ? '이미지 추가 실패.'
            : '새 이미지 추가 없음.'
        setMessage(`${status} ${notes.join(' / ')}`)
      },
    })
    queue.current = inbox
    const onPaste = (event: ClipboardEvent) => {
      if (upload(pastedImages(event))) event.preventDefault()
    }
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
      inbox.close()
      queue.current = null
    }
  }, [])
  const groups = duplicateDrafts(data.drafts)
  return (
    <div className="capture-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CAPTURE INBOX</div>
          <h1>캡처 글감 수집</h1>
          <p>여러 캡처를 모으고 확인한 글감을 실제 키워드 분석으로 연결합니다.</p>
        </div>
      </div>
      <section className="panel research-panel">
        <h2>캡처 이미지 보관</h2>
        <p>
          업로드만으로 이미지를 외부로 전송하지 않습니다. AI 판독은 별도 선택·동의·버튼 실행이
          필요합니다.
        </p>
        <p>
          PNG/JPG/JPEG/WebP · 파일당 4 MiB · 한 번에 최대 20장 · 현재 보관 총 20장/20 MiB · 최대
          2,000만 화소. 원본은 이 브라우저의 이미지 저장소에 보관합니다. 브라우저 자료 삭제 시
          사라질 수 있으니 전체 JSON 백업을 내려받으세요.
        </p>
        <div
          className={`capture-drop${dragging ? ' is-dragging' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current++
            setDragging(true)
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (!dragDepth.current) setDragging(false)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            dragDepth.current = 0
            setDragging(false)
            const files = transferFiles(e.dataTransfer)
            if (files.length) upload(files)
            else
              setError(
                '브라우저가 이미지 파일을 제공하지 않았습니다. 클립보드 캡처 후 붙여넣기 또는 파일 선택을 이용하세요.',
              )
          }}
        >
          <label>
            캡처 이미지 선택
            <input
              aria-label="캡처 이미지 선택"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                void upload(files)
              }}
            />
          </label>
          <p>캡처 이미지를 드래그하거나 Ctrl+V / Cmd+V로 붙여넣으세요.</p>
          <p>Windows: Win+Shift+S → Ctrl+V · Mac: Cmd+Ctrl+Shift+4 → Cmd+V</p>
          <p>
            Mac 오른쪽 아래 플로팅 캡처 썸네일도 드래그할 수 있습니다. 브라우저가 이미지 파일을
            전달하는 경우에 지원합니다.
          </p>
          <p>
            텍스트 입력 중에는 텍스트 붙여넣기를 우선합니다. 등록 시 네이버 API를 호출하지 않습니다.
          </p>
        </div>
        <p aria-live="polite">현재 등록 이미지: {data.images.length} / 20장</p>
        {busy && <progress aria-label="이미지 처리 중" />}
        {!!failed.length && (
          <button
            className="button secondary"
            disabled={busy || aiBusy}
            onClick={() => void upload(failed)}
          >
            실패한 파일 다시 시도 ({failed.length})
          </button>
        )}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        <button className="button secondary" disabled={busy || aiBusy} onClick={reload}>
          저장 자료 다시 불러오기
        </button>
      </section>
      <div className="capture-grid">
        {data.images.map((image, index) => (
          <article
            className="panel capture-card"
            id={`image-${image.id}`}
            key={image.id}
            aria-label={`${index + 1}번 캡처 ${image.name}`}
          >
            <CapturePreview image={image} />
            <p>
              {index + 1}. {image.name} · {Math.ceil(image.size / 1024)} KiB
            </p>
            <div className="capture-actions">
              <button
                className="button secondary"
                disabled={busy || aiBusy || index === 0}
                onClick={() =>
                  action(() => {
                    const images = [...data.images]
                    ;[images[index - 1], images[index]] = [images[index], images[index - 1]]
                    save({ ...data, images })
                  })
                }
              >
                위로
              </button>
              <button
                className="button secondary"
                disabled={busy || aiBusy || index === data.images.length - 1}
                onClick={() =>
                  action(() => {
                    const images = [...data.images]
                    ;[images[index], images[index + 1]] = [images[index + 1], images[index]]
                    save({ ...data, images })
                  })
                }
              >
                아래로
              </button>
              <button
                className="button secondary"
                disabled={busy || aiBusy}
                onClick={() => setEditing(newDraft([image.id]))}
              >
                이 이미지에서 글감 입력
              </button>
              <button
                className="button secondary"
                disabled={busy || aiBusy}
                onClick={() => setDeleting(image.id)}
              >
                이미지 삭제
              </button>
            </div>
            {deleting === image.id && (
              <div>
                <p>
                  이미지 목록에서 제거합니다. 연결된 추출 글감은 남기고 원본 재확인 대상으로
                  바꿉니다. 기존 업무 글감은 삭제하지 않습니다. 복원 전 백업용 원본은 저장소에
                  보존됩니다.
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    action(() => {
                      save({
                        ...data,
                        images: data.images.filter((i) => i.id !== image.id),
                        drafts: data.drafts.map((d) =>
                          d.imageIds.includes(image.id)
                            ? {
                                ...d,
                                imageIds: d.imageIds.filter((id) => id !== image.id),
                                confirmed: false,
                                uncertain: '원본 이미지 연결 삭제: 다시 확인 필요',
                              }
                            : d,
                        ),
                      })
                      setDeleting(null)
                    })
                  }
                >
                  이미지 삭제 확인
                </button>
                <button className="button secondary" onClick={() => setDeleting(null)}>
                  취소
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <AICaptures
        data={data}
        onData={(next) => {
          setData(next)
          setApproveAll(false)
        }}
        onBusy={setAiBusy}
      />
      <section className="panel research-panel">
        <h2>추출 글감 · 사용자 확인</h2>
        <p>
          한 이미지에 여러 글감이 있으면 각각 입력하세요. 같은 제목은 중복 가능성으로 묶으며 자동
          삭제하지 않습니다.
        </p>
        <button
          className="button primary"
          disabled={busy || aiBusy}
          onClick={() => setEditing(newDraft())}
        >
          수동 글감 입력
        </button>
        {!!groups.length && (
          <div>
            <p>동일 제목 중복 그룹 {groups.length}개 · 자동 병합·삭제하지 않습니다.</p>
            {groups.map((g, index) => (
              <p key={g[0]}>
                그룹 {index + 1}:{' '}
                {g.map((id) => (
                  <a key={id} className="text-link" href={`#draft-${id}`}>
                    {data.drafts.find((d) => d.id === id)?.title} ·{' '}
                  </a>
                ))}
              </p>
            ))}
          </div>
        )}
        {!!data.drafts.length && (
          <div>
            <label>
              <input
                type="checkbox"
                checked={approveAll}
                onChange={(e) => setApproveAll(e.target.checked)}
              />
              현재 모든 추출 글감을 원본과 대조했습니다. 미확인 정보는 확인 사항에 남겼습니다.
            </label>
            <button
              className="button secondary"
              disabled={!approveAll || busy || aiBusy || !!editing}
              onClick={() =>
                action(() => {
                  const eligible = data.drafts.filter(
                    (d) =>
                      d.title.trim() && d.keyword.trim() && (d.mode !== 'AI' || d.imageIds.length),
                  )
                  save({
                    ...data,
                    drafts: data.drafts.map((d) =>
                      eligible.includes(d) ? { ...d, confirmed: true } : d,
                    ),
                  })
                  setApproveAll(false)
                  setMessage(
                    `${eligible.length}개 검토 승인. 업무 글감 자동 등록은 하지 않았습니다.`,
                  )
                })
              }
            >
              전체 승인 (제목·키워드·원본 확인)
            </button>
          </div>
        )}
        {editing && (
          <form
            className="idea-form capture-editor"
            onSubmit={(e) => {
              e.preventDefault()
              action(() => {
                save({
                  ...data,
                  drafts: [
                    ...data.drafts.filter((d) => d.id !== editing.id),
                    editing.ai ? { ...editing, ai: { ...editing.ai, edited: true } } : editing,
                  ],
                })
                setEditing(null)
                setMessage('추출 글감을 저장했습니다. 업무 글감 등록은 승인 후 별도로 진행하세요.')
              })
            }}
          >
            <h3>추출 결과 편집</h3>
            {(
              [
                'title',
                'topic',
                'keyword',
                'source',
                'publishedDate',
                'summary',
                'intent',
                'uncertain',
                'timeliness',
                'reviewman',
                'monetization',
              ] as const
            ).map((key) => {
              const labels = {
                title: '글감 제목',
                topic: '핵심 주제',
                keyword: '핵심 키워드',
                source: '출처 사이트 (미확인이면 비워두기)',
                publishedDate: '게시 날짜 (확인 가능한 경우)',
                summary: '핵심 내용',
                intent: '검색 의도 메모',
                uncertain: '불명확한 글자·추가 확인 사항',
                timeliness: '시의성 근거 (사용자 확인)',
                reviewman: 'Reviewman 연결 대상·근거',
                monetization: '광고·제휴 수익화 가설',
              }
              return (
                <label key={key}>
                  {labels[key]}
                  <input
                    type={key === 'publishedDate' ? 'date' : 'text'}
                    maxLength={
                      key === 'summary'
                        ? 2000
                        : key === 'keyword'
                          ? 60
                          : ['title', 'topic', 'intent'].includes(key)
                            ? 120
                            : 500
                    }
                    value={editing[key]}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.value, confirmed: false })
                    }
                  />
                </label>
              )
            })}
            <label>
              글감 카테고리
              <select
                value={editing.category}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    category: e.target.value as CaptureDraft['category'],
                    confirmed: false,
                  })
                }
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>원본 이미지 연결</legend>
              {data.images.map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={editing.imageIds.includes(i.id)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        imageIds: e.target.checked
                          ? [...editing.imageIds, i.id]
                          : editing.imageIds.filter((id) => id !== i.id),
                        confirmed: false,
                      })
                    }
                  />
                  {i.name}
                </label>
              ))}
            </fieldset>
            <label>
              기존 업무 글감 연결
              <select
                value={editing.ideaId ?? ''}
                onChange={(e) => setEditing({ ...editing, ideaId: e.target.value || null })}
              >
                <option value="">아직 연결하지 않음</option>
                {ideas.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={editing.confirmed}
                onChange={(e) => setEditing({ ...editing, confirmed: e.target.checked })}
              />
              원본과 대조했고, 미확인 정보는 비워두거나 확인 사항에 기록했습니다.
            </label>
            <div className="capture-actions">
              <button className="button primary">추출 글감 저장</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>
                취소
              </button>
            </div>
          </form>
        )}
        {data.drafts.map((d) => (
          <article
            className="capture-draft"
            id={`draft-${d.id}`}
            key={d.id}
            aria-label={`${d.title || '제목 미입력'} 추출 글감`}
          >
            <h3>{d.title || '제목 미입력'}</h3>
            <p>
              {d.mode === 'MANUAL' ? 'MANUAL · 사용자 입력' : 'AI 추출 · 사용자 검토 필요'} ·{' '}
              {d.confirmed ? '사용자 대조 완료' : '확인 필요'}
              {groups.some((g) => g.includes(d.id)) ? ' · 동일 제목 중복 후보' : ''}
            </p>
            <p>
              키워드: {d.keyword || '미입력'} · 출처: {d.source || '미확인'} · 게시 날짜:{' '}
              {d.publishedDate || '미확인'}
            </p>
            <p>
              원본:{' '}
              {d.imageIds.map((id) => data.images.find((i) => i.id === id)?.name).join(', ') ||
                '연결 없음'}
            </p>
            {d.ai && (
              <p>
                판독: {d.ai.provider} / {d.ai.model} · {d.ai.at} ·{' '}
                {d.ai.edited ? '사용자 수정됨' : '원본 AI 결과'}
                <br />
                원본 인용: {d.ai.evidence}
                <br />
                출처 근거: {d.ai.sourceEvidence || '미확인'} · 날짜 근거:{' '}
                {d.ai.dateEvidence || '미확인'}
              </p>
            )}
            {d.imageIds.map((id) => (
              <a className="text-link" key={id} href={`#image-${id}`}>
                원본 미리보기 ·{' '}
              </a>
            ))}
            {d.ai && d.ai.keywords.length > 1 && (
              <label>
                분석할 핵심 키워드 선택
                <select
                  value={d.keyword}
                  onChange={(e) =>
                    action(() =>
                      save({
                        ...data,
                        drafts: data.drafts.map((row) =>
                          row.id === d.id
                            ? {
                                ...row,
                                keyword: e.target.value,
                                confirmed: false,
                                ai: { ...d.ai!, edited: true },
                              }
                            : row,
                        ),
                      }),
                    )
                  }
                >
                  <option value={d.keyword}>{d.keyword}</option>
                  {d.ai.keywords
                    .filter((k) => k !== d.keyword)
                    .map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                </select>
              </label>
            )}
            <p>{d.summary}</p>
            {d.uncertain && <p>추가 확인: {d.uncertain}</p>}
            <div className="capture-actions">
              <button className="button secondary" onClick={() => setEditing(structuredClone(d))}>
                추출 결과 수정
              </button>
              <button
                className="button secondary"
                disabled={busy || aiBusy}
                onClick={() => setDeletingDraft(d.id)}
              >
                추출 글감 삭제
              </button>
              {deletingDraft === d.id && (
                <div>
                  <p>
                    이 추출 글감만 삭제합니다. 원본 이미지와 이미 연결한 업무 글감은 유지됩니다.
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy || aiBusy}
                    onClick={() =>
                      action(() => {
                        save({ ...data, drafts: data.drafts.filter((row) => row.id !== d.id) })
                        setDeletingDraft(null)
                        if (editing?.id === d.id) setEditing(null)
                      })
                    }
                  >
                    추출 글감 삭제 확인
                  </button>
                  <button className="button secondary" onClick={() => setDeletingDraft(null)}>
                    삭제 취소
                  </button>
                </div>
              )}
              <button
                className="button secondary"
                disabled={
                  d.confirmed ||
                  !d.title.trim() ||
                  !d.keyword.trim() ||
                  (d.mode === 'AI' && !d.imageIds.length) ||
                  busy ||
                  aiBusy
                }
                onClick={() =>
                  action(() =>
                    save({
                      ...data,
                      drafts: data.drafts.map((row) =>
                        row.id === d.id ? { ...row, confirmed: true } : row,
                      ),
                    }),
                  )
                }
              >
                원본 대조 후 개별 승인
              </button>
              <button
                className="button secondary"
                disabled={!d.confirmed || !d.title.trim() || !d.keyword.trim() || busy || aiBusy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const idea = await linkCaptureIdea(localStorage, d.id)
                    setData(store.read())
                    await refresh(true)
                    setMessage(`업무 글감 연결 완료: ${idea.title}`)
                    setError('')
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '글감 연결 실패')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                업무 글감 저장·연결
              </button>
              {d.ideaId && ideas.some((i) => i.id === d.ideaId) && (
                <Link
                  className="button primary"
                  to={`/keywords?idea=${encodeURIComponent(d.ideaId)}&keyword=${encodeURIComponent(d.keyword)}`}
                >
                  키워드 분석
                </Link>
              )}
            </div>
          </article>
        ))}
        <p>
          <Link to="/recommendations">저장된 키워드로 발행 후보 TOP 10 검토</Link> ·{' '}
          <Link to="/backup">원본 포함 전체 백업</Link>
        </p>
      </section>
    </div>
  )
}
