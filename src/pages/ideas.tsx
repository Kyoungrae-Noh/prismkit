import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Columns3, FilePenLine, List, Plus, Search, Trash2 } from 'lucide-react'
import { useWorkspace } from '../app/workspace'
import { IdeaForm } from '../components/idea-form'
import { EmptyState, formatDate, Modal, StatusBadge } from '../components/ui'
import { categories, statuses, statusLabels, type Idea } from '../domain/models'

export function Ideas({ onCreate, notify }: { onCreate(): void; notify(message: string): void }) {
  const { ideas, removeIdea } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [view, setView] = useState<'list' | 'board'>('list')
  const [deleteTarget, setDeleteTarget] = useState<Idea | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const selectedStatus = params.get('status') ?? 'all'
  const status = statuses.some((value) => value === selectedStatus) ? selectedStatus : 'all'
  const editing = ideas.find((idea) => idea.id === params.get('edit'))
  const filtered = ideas.filter(
    (idea) =>
      (status === 'all' || idea.status === status) &&
      (category === 'all' || idea.category === category) &&
      `${idea.title} ${idea.keyword} ${idea.memo}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  )
  function setParam(key: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    try {
      await removeIdea(deleteTarget.id)
      setDeleteTarget(null)
      notify('글감을 삭제했습니다.')
    } catch (error) {
      setError(error instanceof Error ? error.message : '삭제하지 못했습니다.')
    } finally {
      setDeleting(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">IDEA LIBRARY</div>
          <h1>
            글감 관리<span className="accent-dot">.</span>
          </h1>
          <p>스쳐 지나가는 생각을, 오래 남는 콘텐츠로 만들어보세요.</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={18} />새 글감 추가
        </button>
      </div>
      <div className="summary-strip">
        <div>
          <span className="summary-icon">
            <FilePenLine size={21} />
          </span>
          <span>나의 콘텐츠 서랍</span>
          <strong>
            {ideas.length}
            <small>개의 글감</small>
          </strong>
        </div>
        <p>지금은 브라우저에 저장되는 개인 작업 공간입니다.</p>
      </div>
      <section className="panel idea-panel">
        <div className="status-tabs" aria-label="진행 상태 필터">
          <button
            className={status === 'all' ? 'active' : ''}
            onClick={() => setParam('status', '')}
          >
            전체 <span>{ideas.length}</span>
          </button>
          {statuses.map((value) => (
            <button
              className={status === value ? 'active' : ''}
              key={value}
              onClick={() => setParam('status', value)}
            >
              {statusLabels[value]}{' '}
              <span>{ideas.filter((idea) => idea.status === value).length}</span>
            </button>
          ))}
        </div>
        <div className="list-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="글감 검색"
              placeholder="제목, 키워드, 메모로 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="검색어 지우기" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </label>
          <div className="toolbar-end">
            <select
              aria-label="글감 카테고리"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">모든 카테고리</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <div className="view-toggle">
              <button
                aria-label="목록 보기"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={18} />
              </button>
              <button
                aria-label="보드 보기"
                aria-pressed={view === 'board'}
                onClick={() => setView('board')}
              >
                <Columns3 size={18} />
              </button>
            </div>
          </div>
        </div>
        {!filtered.length ? (
          <EmptyState
            title="표시할 글감이 없어요"
            description={
              ideas.length
                ? '다른 검색어나 필터로 찾아보세요.'
                : '첫 번째 아이디어를 기록하며 시작해보세요.'
            }
            action={
              ideas.length ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setQuery('')
                    setCategory('all')
                    setParam('status', '')
                  }}
                >
                  필터 초기화
                </button>
              ) : (
                <button className="button primary" onClick={onCreate}>
                  <Plus size={16} />새 글감 추가
                </button>
              )
            }
          />
        ) : view === 'list' ? (
          <div className="table-scroll">
            <table className="ideas-table">
              <thead>
                <tr>
                  <th>글감 제목</th>
                  <th>카테고리</th>
                  <th>진행 상태</th>
                  <th>최근 수정</th>
                  <th>
                    <span className="sr-only">작업</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((idea) => (
                  <tr key={idea.id}>
                    <td>
                      <button
                        className="table-title"
                        aria-label={`${idea.title} 수정`}
                        onClick={() => setParam('edit', idea.id)}
                      >
                        <span className="document-icon">
                          <FilePenLine size={18} />
                        </span>
                        <span>
                          {idea.title}
                          <small>{idea.keyword}</small>
                        </span>
                      </button>
                    </td>
                    <td className="muted">{idea.category}</td>
                    <td>
                      <StatusBadge status={idea.status} />
                    </td>
                    <td className="muted">{formatDate(idea.updatedAt)}</td>
                    <td>
                      <Link
                        className="button secondary"
                        aria-label={`${idea.title} 키워드 분석`}
                        to={`/keywords?${new URLSearchParams({ keyword: idea.keyword, idea: idea.id })}`}
                      >
                        키워드 분석
                      </Link>
                      <button
                        className="icon-button delete-button"
                        aria-label={`${idea.title} 삭제`}
                        onClick={() => {
                          setDeleteTarget(idea)
                          setError('')
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="board">
            {statuses
              .filter((value) => status === 'all' || status === value)
              .map((value) => (
                <section className="board-column" key={value}>
                  <h3>
                    <StatusBadge status={value} />
                    <span>{filtered.filter((idea) => idea.status === value).length}</span>
                  </h3>
                  {filtered
                    .filter((idea) => idea.status === value)
                    .map((idea) => (
                      <button
                        className="board-card"
                        key={idea.id}
                        onClick={() => setParam('edit', idea.id)}
                      >
                        <span className="category-label">{idea.category}</span>
                        <strong>{idea.title}</strong>
                        <span className="keyword-tag">{idea.keyword}</span>
                        <span className="board-card-footer">
                          <FilePenLine size={14} />
                          {formatDate(idea.updatedAt)}
                        </span>
                      </button>
                    ))}
                  {!filtered.some((idea) => idea.status === value) && (
                    <p className="board-empty">아직 글감이 없어요</p>
                  )}
                </section>
              ))}
          </div>
        )}
        <div className="table-footer">
          <span>
            전체 {ideas.length}개 중 {filtered.length}개 표시
          </span>
          <span>최근 수정 순</span>
        </div>
      </section>
      {editing && (
        <IdeaForm
          idea={editing}
          onClose={() => setParam('edit', '')}
          onSaved={() => {
            setParam('edit', '')
            notify('글감을 수정했습니다.')
          }}
        />
      )}
      {deleteTarget && (
        <Modal
          title="글감을 삭제할까요?"
          description="삭제한 글감은 되돌릴 수 없습니다."
          onClose={() => {
            if (!deleting) setDeleteTarget(null)
          }}
        >
          <p className="delete-title">{deleteTarget.title}</p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              취소
            </button>
            <button
              className="button danger"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? '삭제 중…' : '삭제하기'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
