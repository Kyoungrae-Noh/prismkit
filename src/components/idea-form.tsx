import { useState, type FormEvent } from 'react'
import { LoaderCircle, Plus, Save } from 'lucide-react'
import { categories, statuses, statusLabels, type Idea, type IdeaInput } from '../domain/models'
import { useWorkspace } from '../app/workspace'
import { Modal } from './ui'

export function IdeaForm({
  idea,
  initial,
  onClose,
  onSaved,
}: {
  idea?: Idea
  initial?: Partial<IdeaInput>
  onClose(): void
  onSaved(): void
}) {
  const { saveIdea } = useWorkspace()
  const [input, setInput] = useState<IdeaInput>(
    idea ?? {
      title: '',
      keyword: '',
      category: '라이프스타일',
      status: 'inbox',
      memo: '',
      ...initial,
    },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  function update<K extends keyof IdeaInput>(key: K, value: IdeaInput[K]) {
    setInput((current) => ({ ...current, [key]: value }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await saveIdea(input, idea?.id)
      onSaved()
    } catch (error) {
      setError(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해 주세요.')
      setSaving(false)
    }
  }
  return (
    <Modal
      title={idea ? '글감 수정' : '새로운 글감'}
      description="작은 아이디어를 다음 콘텐츠로 이어가세요."
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <form onSubmit={submit} className="idea-form">
        <label>
          제목 <span className="required">*</span>
          <input
            autoFocus
            required
            maxLength={120}
            value={input.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="어떤 이야기를 나누고 싶으신가요?"
          />
        </label>
        <label>
          핵심 키워드 <span className="required">*</span>
          <input
            required
            maxLength={60}
            value={input.keyword}
            onChange={(event) => update('keyword', event.target.value)}
            placeholder="예: 모닝 루틴"
          />
        </label>
        <div className="form-row">
          <label>
            카테고리
            <select
              value={input.category}
              onChange={(event) => update('category', event.target.value as IdeaInput['category'])}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            진행 상태
            <select
              value={input.status}
              onChange={(event) => update('status', event.target.value as IdeaInput['status'])}
            >
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          메모 <span className="optional">선택</span>
          <textarea
            rows={4}
            maxLength={2000}
            value={input.memo}
            onChange={(event) => update('memo', event.target.value)}
            placeholder="콘텐츠의 방향, 참고할 내용 등을 자유롭게 기록하세요."
          />
        </label>
        <p className="form-note">이 브라우저에 저장됩니다. 실제 콘텐츠 발행은 수행하지 않습니다.</p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? (
              <LoaderCircle size={17} className="spin" />
            ) : idea ? (
              <Save size={17} />
            ) : (
              <Plus size={17} />
            )}
            {saving ? '저장 중…' : idea ? '변경사항 저장' : '글감 추가'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
