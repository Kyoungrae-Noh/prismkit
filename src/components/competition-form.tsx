import { useState } from 'react'
import type { SavedCandidate } from '../data/candidate-store'
import { readEvidence } from '../data/evidence'
import {
  blankCompetition,
  naverSearch,
  qualityLabels,
  type Competition,
  type Answer,
} from '../domain/publishing'
import { Modal } from './ui'
export function CompetitionForm({
  candidate,
  record,
  onSave,
  onClose,
}: {
  candidate: SavedCandidate
  record?: Competition
  onSave: (value: Competition) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Competition>(() =>
    structuredClone(record ?? blankCompetition(candidate)),
  )
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const patch = (values: Partial<Competition>) => setDraft((old) => ({ ...old, ...values }))
  const answer = (label: string, value: Answer, change: (value: Answer) => void) => (
    <label>
      {label}
      <select value={value} onChange={(e) => change(e.target.value as Answer)}>
        <option value="unknown">확인 필요</option>
        <option value="yes">예</option>
        <option value="no">아니요</option>
      </select>
    </label>
  )
  return (
    <Modal title={`${candidate.candidate.keyword} 경쟁 자료`} onClose={onClose}>
      <form
        className="idea-form"
        onSubmit={(e) => {
          e.preventDefault()
          try {
            onSave({ ...draft, updatedAt: new Date().toISOString() })
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      >
        <p>
          MANUAL · 사람이 확인한 자료만 입력하세요. 캡처는 자동 판독하지 않습니다. 미확인 항목이
          있어도 임시 저장할 수 있습니다.
        </p>
        <a href={naverSearch(draft.keyword)} target="_blank" rel="noreferrer">
          네이버 검색 열기
        </a>
        <label>
          검색 결과 URL
          <input value={draft.searchUrl} onChange={(e) => patch({ searchUrl: e.target.value })} />
        </label>
        <button
          type="button"
          className="button"
          onClick={() => patch({ searchUrl: naverSearch(draft.keyword) })}
        >
          검색 URL 채우기
        </button>
        <label>
          검색 확인 날짜
          <input
            type="date"
            value={draft.checkedDate}
            onChange={(e) => patch({ checkedDate: e.target.value })}
          />
        </label>
        {answer('블로그 콘텐츠 노출', draft.blog, (blog) => patch({ blog }))}
        {answer('공식 기관·대형 매체 점유', draft.dominant, (dominant) => patch({ dominant }))}
        <label>
          블로그 위치
          <select
            value={draft.position}
            onChange={(e) => patch({ position: e.target.value as Competition['position'] })}
          >
            <option value="unknown">확인 필요</option>
            <option value="top">상단</option>
            <option value="middle">중간</option>
            <option value="bottom">하단</option>
            <option value="absent">노출 없음</option>
          </select>
        </label>
        <label>
          검색 결과 성격
          <select
            value={draft.serp}
            onChange={(e) => patch({ serp: e.target.value as Competition['serp'] })}
          >
            <option value="unknown">확인 필요</option>
            <option value="information">정보형</option>
            <option value="commercial">상업형</option>
            <option value="mixed">혼합</option>
          </select>
        </label>
        <details>
          <summary>검색 결과 수 · Reviewman 연결 (선택)</summary>
          <label>
            사용자가 확인한 검색 결과 수
            <input
              type="number"
              min="0"
              value={draft.total ?? ''}
              onChange={(e) =>
                patch({ total: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label>
            Reviewman 연결 URL
            <input
              value={draft.reviewmanUrl}
              onChange={(e) => patch({ reviewmanUrl: e.target.value })}
            />
          </label>
        </details>
        <h3>상위 경쟁 게시물</h3>
        {draft.posts.map((post, index) => (
          <fieldset key={index}>
            <legend>게시물 {index + 1}</legend>
            {(['title', 'url', 'date', 'summary', 'features'] as const).map((field, i) => (
              <label key={field}>
                {['게시물 제목', '게시물 URL', '발행일', '게시물 요약', '경쟁 글의 특징'][i]}
                <input
                  type={field === 'date' ? 'date' : 'text'}
                  value={post[field]}
                  onChange={(e) =>
                    patch({
                      posts: draft.posts.map((p, j) =>
                        j === index ? { ...p, [field]: e.target.value } : p,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => patch({ posts: draft.posts.filter((_, i) => i !== index) })}
            >
              게시물 삭제
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button"
          disabled={draft.posts.length >= 10}
          onClick={() =>
            patch({
              posts: [...draft.posts, { title: '', url: '', date: '', summary: '', features: '' }],
            })
          }
        >
          경쟁 게시물 추가
        </button>
        <details open>
          <summary>경쟁 평가 체크리스트</summary>
          {(Object.keys(qualityLabels) as (keyof Competition['quality'])[]).map((key) => (
            <div key={key}>
              {answer(qualityLabels[key], draft.quality[key], (value) =>
                patch({ quality: { ...draft.quality, [key]: value } }),
              )}
            </div>
          ))}
          <label>
            추가로 필요한 정보 · 차별화 근거
            <textarea
              value={draft.missingInfo}
              onChange={(e) => patch({ missingInfo: e.target.value })}
            />
          </label>
        </details>
        <details>
          <summary>캡처 근거 (선택)</summary>
          <p>
            PNG/JPEG/WebP · 파일당 512 KiB · 후보당 3장 · 전체 1.5 MiB. 변경·삭제는 저장 시
            반영됩니다.
          </p>
          <label>
            검색 화면 캡처
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || draft.images.length >= 3}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                setBusy(true)
                try {
                  const image = await readEvidence(file)
                  setDraft((old) => ({ ...old, images: [...old.images, image] }))
                  setError('')
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            />
          </label>
          {draft.images.map((image) => (
            <figure key={image.id}>
              <img
                className="evidence-image"
                src={image.dataUrl}
                alt={`${draft.keyword} 근거 ${image.name}`}
              />
              <figcaption>{image.name} · AI 판독 미실시</figcaption>
              <button
                type="button"
                onClick={() =>
                  patch({ images: draft.images.filter((item) => item.id !== image.id) })
                }
              >
                이미지 삭제
              </button>
            </figure>
          ))}
        </details>
        <details>
          <summary>발행 제외 (선택)</summary>
          <label>
            제외 근거
            <textarea
              value={draft.excludeReason}
              onChange={(e) => patch({ excludeReason: e.target.value })}
            />
          </label>
        </details>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>
          경쟁 자료 저장
        </button>
      </form>
    </Modal>
  )
}
