import { useState } from 'react'
import { useWorkspace } from '../app/workspace'
import {
  accounts,
  publicationStates,
  publicationLabels,
  type Publication,
} from '../domain/publishing'
import { Modal } from './ui'
export function PublicationForm({
  initial,
  onSave,
  onClose,
}: {
  initial: Publication
  onSave: (value: Publication) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState('')
  const { ideas } = useWorkspace()
  return (
    <Modal title="발행 이력 등록·수정" onClose={onClose}>
      <form
        className="idea-form"
        onSubmit={(e) => {
          e.preventDefault()
          try {
            onSave(draft)
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      >
        <label>
          블로그 계정
          <select
            value={draft.account}
            onChange={(e) =>
              setDraft({ ...draft, account: e.target.value as Publication['account'] })
            }
          >
            {accounts.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        {(['keyword', 'topic', 'title', 'date', 'blogUrl', 'reviewmanUrl'] as const).map(
          (field, i) => (
            <label key={field}>
              {
                [
                  '발행 키워드',
                  '핵심 주제',
                  '글 제목',
                  '실제 발행 날짜',
                  '네이버 블로그 글 URL',
                  'Reviewman 연결 URL',
                ][i]
              }
              <input
                required={field === 'keyword' || field === 'title'}
                type={field === 'date' ? 'date' : 'text'}
                value={draft[field]}
                onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              />
            </label>
          ),
        )}
        <label>
          발행 상태
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft({ ...draft, status: e.target.value as Publication['status'] })
            }
          >
            {publicationStates.map((s) => (
              <option key={s} value={s}>
                {publicationLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          관련 글감
          <select
            value={draft.ideaId ?? ''}
            onChange={(e) => setDraft({ ...draft, ideaId: e.target.value || null })}
          >
            <option value="">연결 없음</option>
            {ideas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary">발행 이력 저장</button>
      </form>
    </Modal>
  )
}
