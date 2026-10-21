import { useEffect, useRef } from 'react'
import type { DraftContent, Manuscript } from '../domain/manuscripts'

// React never replaces the active editable DOM, so Korean composition and selection survive saves.
export function InlineText({
  value,
  label,
  change,
}: {
  value: string
  label: string
  change(value: string): void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const composing = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value
  }, [value])
  const commit = () => {
    if (!composing.current && ref.current) change(ref.current.innerText.replace(/\r/g, ''))
  }
  return (
    <span
      ref={ref}
      className="inline-editor"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline="true"
      tabIndex={0}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
        commit()
      }}
      onInput={commit}
      onBlur={commit}
    />
  )
}

export function ManuscriptEditor({
  manuscript: m,
  edit,
  saveError = false,
}: {
  saveError?: boolean
  manuscript: Manuscript
  edit(patch: Partial<DraftContent>): void
}) {
  const c = m.content
  const text = (label: string, value: string, change: (v: string) => void) => (
    <InlineText label={label} value={value} change={change} />
  )
  const image = (i: number) => (
    <aside className="image-placeholder" key={i}>
      이미지 {i + 1} 삽입 위치
      {text(`이미지 ${i + 1} 위치·설명`, c.imageNotes[i], (v) =>
        edit({ imageNotes: c.imageNotes.map((x, j) => (j === i ? v : x)) }),
      )}
    </aside>
  )
  return (
    <article
      className={`manuscript-preview editable-manuscript ${m.brief.type}`}
      aria-label="통합 원고 편집"
    >
      <header>
        <span className="subtle-badge">
          미검증 초안 · 클릭해서 수정 · {saveError ? '저장 확인 필요' : '자동 저장'}
        </span>
        <h1>{text('원고 제목', c.title, (title) => edit({ title }))}</h1>
        {m.brief.type === 'reviewman' && (
          <>
            <p>Meta description</p>
            {text('Meta description', c.meta, (meta) => edit({ meta }))}
            <h2>{text('H1', c.h1, (h1) => edit({ h1 }))}</h2>
          </>
        )}
      </header>
      {text('도입부·핵심 정보 요약', c.introduction, (introduction) => edit({ introduction }))}
      {c.sections.map((s, i) => (
        <section key={i}>
          <h2>
            {m.brief.type === 'naver' && '│ '}
            {text(`소제목 ${i + 1}`, s.heading, (heading) =>
              edit({ sections: c.sections.map((x, j) => (i === j ? { ...x, heading } : x)) }),
            )}
          </h2>
          {text(`본문 ${i + 1}`, s.body, (body) =>
            edit({ sections: c.sections.map((x, j) => (i === j ? { ...x, body } : x)) }),
          )}
          <small>
            근거:{' '}
            {s.sourceIds.map((id) => m.brief.sources.find((x) => x.id === id)?.title).join(', ') ||
              '미확인'}
          </small>
          {c.imageNotes[i] !== undefined && image(i)}
        </section>
      ))}
      {c.imageNotes.slice(c.sections.length).map((_, i) => image(c.sections.length + i))}
      {c.comparison && c.comparison.rows.length > 0 && (
        <section>
          <h2>비교표</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {c.comparison.columns.map((x, i) => (
                    <th key={i}>
                      {text(`비교표 제목 ${i + 1}`, x, (v) =>
                        edit({
                          comparison: {
                            ...c.comparison!,
                            columns: c.comparison!.columns.map((a, j) => (j === i ? v : a)),
                          },
                        }),
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.comparison.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((x, j) => (
                      <td key={j}>
                        {text(`비교표 ${i + 1}행 ${j + 1}열`, x, (v) =>
                          edit({
                            comparison: {
                              ...c.comparison!,
                              rows: c.comparison!.rows.map((r, k) =>
                                k === i ? r.map((a, n) => (n === j ? v : a)) : r,
                              ),
                            },
                          }),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <h2>체크리스트</h2>
      {text('체크리스트 (줄마다 한 항목)', c.checklist.join('\n'), (v) =>
        edit({ checklist: v.split('\n') }),
      )}
      <h2>FAQ</h2>
      {c.faq.map((f, i) => (
        <section key={i}>
          <h3>
            {text(`FAQ 질문 ${i + 1}`, f.question, (question) =>
              edit({ faq: c.faq.map((x, j) => (i === j ? { ...x, question } : x)) }),
            )}
          </h3>
          {text(`FAQ 답변 ${i + 1}`, f.answer, (answer) =>
            edit({ faq: c.faq.map((x, j) => (i === j ? { ...x, answer } : x)) }),
          )}
        </section>
      ))}
      {text('마무리', c.conclusion, (conclusion) => edit({ conclusion }))}
      <h2>공식 출처·관련 콘텐츠</h2>
      {m.brief.sources
        .filter((s) => [...c.sourceIds, ...c.internalIds].includes(s.id))
        .map((s) => (
          <p key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>{' '}
            · 확인 {s.checkedDate}
          </p>
        ))}
    </article>
  )
}
