import { useEffect, useState, type FormEvent } from 'react'
import { useWorkspace } from '../app/workspace'
import { RESEARCH_KEY } from '../data/research-store'
import {
  assessResearch,
  displayCount,
  parseCount,
  splitKeywords,
  today,
  type KeywordResearch,
} from '../domain/research'
import { createManualProviders } from '../providers/manual'
import type { BlogData, ProviderResult, TrendData, VolumeData } from '../providers/contracts'
import { Modal } from './ui'

function ResearchResult({ record, onEdit }: { record: KeywordResearch; onEdit(): void }) {
  const { ideas } = useWorkspace()
  const [results, setResults] = useState<{
    volume: ProviderResult<VolumeData>
    trend: ProviderResult<TrendData>
    blog: ProviderResult<BlogData>
    related: string[]
  } | null>(null)
  useEffect(() => {
    let active = true
    const provider = createManualProviders(record)
    void Promise.all([
      provider.getVolume(record.keyword),
      provider.getTrend(record.keyword),
      provider.getCompetition(record.keyword),
      provider.expand(record.keyword),
    ]).then(([volume, trend, blog, expansion]) => {
      if (active) setResults({ volume, trend, blog, related: expansion.data?.keywords ?? [] })
    })
    return () => {
      active = false
    }
  }, [record])
  const assessment = assessResearch()
  return (
    <article className="research-record" aria-label={`${record.keyword} 수동 분석`}>
      <div className="research-heading">
        <h3>{record.keyword}</h3>
        <button
          className="button secondary"
          onClick={onEdit}
          aria-label={`${record.keyword} 수동 자료 수정`}
        >
          수정
        </button>
      </div>
      <p>
        <span className="subtle-badge">MANUAL · UNVERIFIED</span> 사용자 입력 · API 검증 미실시
      </p>
      <dl className="research-metrics">
        <div>
          <dt>PC 월간 검색량</dt>
          <dd>{displayCount(results?.volume.data?.pc ?? null)}</dd>
        </div>
        <div>
          <dt>모바일 월간 검색량</dt>
          <dd>{displayCount(results?.volume.data?.mobile ?? null)}</dd>
        </div>
        <div>
          <dt>검색량 합계</dt>
          <dd>{displayCount(results?.volume.data?.total ?? null)}</dd>
        </div>
        <div>
          <dt>검색 추세</dt>
          <dd>{results?.trend.data ? '상대 지수' : '확인 불가'}</dd>
        </div>
        <div>
          <dt>블로그 검색 결과 수</dt>
          <dd>{displayCount(results?.blog.data?.total ?? null)}</dd>
        </div>
        <div>
          <dt>경쟁 분석 상태</dt>
          <dd>미분석 · {assessment.recommendation}</dd>
        </div>
      </dl>
      <p>검색 의도: {record.intent || '확인 불가'}</p>
      <p>관련 키워드: {results?.related.join(', ') || '확인 불가'}</p>
      <p>
        연결 글감:{' '}
        {record.ideaId
          ? (ideas.find((idea) => idea.id === record.ideaId)?.title ?? '삭제되었거나 확인 불가')
          : '연결 없음'}
      </p>
      <p>데이터 출처: {record.source}</p>
      <p>
        마지막 확인 날짜: <time dateTime={record.checkedDate}>{record.checkedDate}</time>
      </p>
      <p>
        자료 저장 시각:{' '}
        <time dateTime={record.updatedAt}>
          {new Date(record.updatedAt).toLocaleString('ko-KR')}
        </time>
      </p>
      <p className="form-note">
        {assessment.reason} 검색 결과 수는 전체 블로그 문서 수를 뜻하지 않습니다. 누락값 또는
        &lt;10이 있으면 정확한 합계는 확인 불가입니다.
      </p>
    </article>
  )
}

function ResearchForm({
  record,
  onClose,
  onSaved,
}: {
  record: KeywordResearch | null
  onClose(): void
  onSaved(): void
}) {
  const { ideas, researchRepository } = useWorkspace()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const field = (name: string) => String(data.get(name) ?? '')
    setError('')
    setSaving(true)
    try {
      await researchRepository.saveResearch(
        {
          keyword: field('keyword'),
          related: splitKeywords(field('related')),
          intent: field('intent'),
          ideaId: field('ideaId') || null,
          pc: parseCount(field('pc')),
          mobile: parseCount(field('mobile')),
          blogTotal: parseCount(field('blogTotal'), false) as number | null,
          source: field('source'),
          checkedDate: field('checkedDate'),
        },
        record?.id,
      )
      onSaved()
    } catch (error) {
      setError(error instanceof Error ? error.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      title={record ? '수동 키워드 자료 수정' : '수동 키워드 자료 추가'}
      description="사용자가 확인한 자료만 입력하세요. API 검증 데이터와 구분하여 브라우저에 저장합니다."
      onClose={onClose}
    >
      <form className="idea-form" onSubmit={submit}>
        <label>
          핵심 키워드
          <input name="keyword" required maxLength={60} defaultValue={record?.keyword} />
        </label>
        <label>
          관련 키워드 붙여넣기
          <textarea
            name="related"
            maxLength={10000}
            rows={3}
            defaultValue={record?.related.join('\n')}
            placeholder="줄바꿈, 쉼표 또는 세미콜론으로 구분"
          />
        </label>
        <label>
          검색 의도
          <input
            name="intent"
            maxLength={120}
            defaultValue={record?.intent}
            placeholder="예: 구매 전 비교, 정보 탐색"
          />
        </label>
        <label>
          글감 연결
          <select name="ideaId" defaultValue={record?.ideaId ?? ''}>
            <option value="">연결 없음</option>
            {record?.ideaId && !ideas.some((idea) => idea.id === record.ideaId) && (
              <option value={record.ideaId}>기존 연결 글감 확인 불가</option>
            )}
            {ideas.map((idea) => (
              <option value={idea.id} key={idea.id}>
                {idea.title}
              </option>
            ))}
          </select>
        </label>
        <div className="research-grid">
          <label>
            PC 월간 검색량
            <input name="pc" defaultValue={record?.pc ?? ''} placeholder="확인 불가면 비워두세요" />
          </label>
          <label>
            모바일 월간 검색량
            <input
              name="mobile"
              defaultValue={record?.mobile ?? ''}
              placeholder="0 이상의 정수 또는 <10"
            />
          </label>
        </div>
        <label>
          블로그 검색 결과 수
          <input
            name="blogTotal"
            inputMode="numeric"
            defaultValue={record?.blogTotal ?? ''}
            placeholder="확인 불가면 비워두세요"
          />
        </label>
        <label>
          데이터 출처
          <input
            name="source"
            required
            maxLength={500}
            defaultValue={record?.source}
            placeholder="서비스·화면명 또는 URL (비밀키 입력 금지)"
          />
        </label>
        <label>
          확인 날짜
          <input
            type="date"
            name="checkedDate"
            required
            max={today()}
            defaultValue={record?.checkedDate ?? today()}
          />
        </label>
        <p className="form-note">
          입력한 수치는 사용자 보고값입니다. 출처·확인 날짜가 서로 다른 자료는 별도 기록으로
          저장하세요. 기기 간 동기화되지 않습니다.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            취소
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? '저장 중…' : '수동 자료 저장'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ResearchPanel() {
  const { researchRepository } = useWorkspace()
  const [records, setRecords] = useState<KeywordResearch[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<KeywordResearch | null | undefined>(undefined)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    void researchRepository
      .listResearch()
      .then((data) => {
        if (active) {
          setRecords(data)
          setError('')
        }
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : '자료를 읽지 못했습니다.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [researchRepository, revision])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key === RESEARCH_KEY) setRevision((value) => value + 1)
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return (
    <section className="panel research-panel" aria-label="수동 키워드 분석 자료">
      <div className="research-heading">
        <div>
          <div className="eyebrow">MY KEYWORD RESEARCH</div>
          <h2>나의 키워드 자료</h2>
        </div>
        <button
          className="button primary"
          onClick={() => setEditing(null)}
          disabled={loading || !!error}
        >
          수동 자료 추가
        </button>
      </div>
      <p>
        API 연결 없이 확인한 자료를 기록하세요. 아래 자료는 DEMO와 분리되어 저장되며, 실제 API
        연결은 아직 제공하지 않습니다.
      </p>
      {message && <p role="status">{message}</p>}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>
            다시 불러오기
          </button>
        </div>
      ) : loading ? (
        <p>자료를 불러오는 중…</p>
      ) : records.length ? (
        records.map((record) => (
          <ResearchResult record={record} key={record.id} onEdit={() => setEditing(record)} />
        ))
      ) : (
        <p>
          저장한 수동 자료가 없습니다. 검색량을 몰라도 출처와 확인 날짜를 함께 기록할 수 있습니다.
        </p>
      )}
      {editing !== undefined && (
        <ResearchForm
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            setRevision((value) => value + 1)
            setMessage('수동 자료를 저장했습니다.')
          }}
        />
      )}
    </section>
  )
}
