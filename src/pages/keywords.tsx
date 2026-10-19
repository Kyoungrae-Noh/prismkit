import { ResearchPanel } from '../components/research-panel'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Check,
  Info,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useWorkspace } from '../app/workspace'
import { IdeaForm } from '../components/idea-form'
import { EmptyState, formatNumber, Growth, Modal, Sparkline } from '../components/ui'
import { categories, type Keyword } from '../domain/models'

const competitionLabels = { low: '낮음', medium: '보통', high: '높음' }
export function Keywords({ notify }: { notify(message: string): void }) {
  const { keywords, ideas } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const query = params.get('keyword') ?? ''
  const [category, setCategory] = useState('all')
  const [competition, setCompetition] = useState('all')
  const [sort, setSort] = useState('opportunity')
  const [selected, setSelected] = useState<Keyword | null>(null)
  const [saving, setSaving] = useState<Keyword | null>(null)
  function setQuery(value: string) {
    setParams(value ? { keyword: value } : {}, { replace: true })
  }
  const filtered = keywords
    .filter(
      (keyword) =>
        keyword.term.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
        (category === 'all' || keyword.category === category) &&
        (competition === 'all' || keyword.competition === competition),
    )
    .sort((a, b) =>
      sort === 'volume'
        ? b.monthlySearches - a.monthlySearches
        : sort === 'growth'
          ? b.growth - a.growth
          : b.opportunity - a.opportunity,
    )
  const saved = (keyword: Keyword) => ideas.some((idea) => idea.keyword === keyword.term)
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KEYWORD EXPLORER</div>
          <h1>
            키워드 분석<span className="accent-dot">.</span>
          </h1>
          <p>사람들이 궁금해하는 것에서, 다음 콘텐츠의 힌트를 찾아보세요.</p>
        </div>
        <span className="demo-label">
          <span />
          DEMO · 샘플 데이터 모드
        </span>
      </div>
      <section className="keyword-search-panel">
        <div className="search-panel-icon">
          <Search size={24} />
        </div>
        <h2>어떤 주제가 궁금하신가요?</h2>
        <p>관심 키워드를 검색하고 콘텐츠의 가능성을 살펴보세요.</p>
        <label className="large-search">
          <Search size={21} />
          <input
            aria-label="키워드 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="키워드를 입력하세요. 예: AI, 루틴, 여행"
          />
          {query && (
            <button aria-label="키워드 검색어 지우기" onClick={() => setQuery('')}>
              ×
            </button>
          )}
          <span className="search-hint">샘플 내 검색</span>
        </label>
        <div className="suggested-queries">
          <span>추천 탐색</span>
          {['AI', '루틴', '여행', '마케팅'].map((term) => (
            <button key={term} onClick={() => setQuery(term)}>
              {term}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      </section>
      <div className="notice">
        <Info size={17} />
        <span>
          검색량·상승률·기회 점수는 화면 확인을 위한 가상 데이터입니다. 실제 데이터 수집과 AI 분석은
          다음 단계에서 연결됩니다.
        </span>
      </div>
      <section className="panel keywords-panel">
        <div className="section-heading">
          <div>
            <h2>
              키워드 탐색 <span className="count-label">{filtered.length}</span>
            </h2>
            <p>기회 점수가 높은 키워드부터 확인해보세요.</p>
          </div>
          <span className="small-muted">월간 검색량 기준 · 샘플</span>
        </div>
        <div className="list-toolbar">
          <div className="filter-group">
            <select
              aria-label="키워드 카테고리"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">모든 카테고리</option>
              {categories.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="경쟁도 필터"
              value={competition}
              onChange={(event) => setCompetition(event.target.value)}
            >
              <option value="all">모든 경쟁도</option>
              {Object.entries(competitionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="sort-control">
            <ArrowDownWideNarrow size={16} />
            <select
              aria-label="키워드 정렬"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="opportunity">기회 점수 순</option>
              <option value="volume">검색량 순</option>
              <option value="growth">상승률 순</option>
            </select>
          </label>
        </div>
        {!filtered.length ? (
          <EmptyState
            title="일치하는 샘플 키워드가 없어요"
            description="현재 준비된 샘플에서 검색합니다. 다른 키워드나 필터를 사용해보세요."
            action={
              <button
                className="button secondary"
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setCompetition('all')
                }}
              >
                검색 초기화
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="keyword-table">
              <thead>
                <tr>
                  <th>키워드</th>
                  <th>월간 검색량</th>
                  <th>상승률</th>
                  <th>경쟁도</th>
                  <th>기회 점수</th>
                  <th>관심도 추이</th>
                  <th>
                    <span className="sr-only">글감 저장</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((keyword) => (
                  <tr key={keyword.id}>
                    <td>
                      <button
                        className="keyword-name"
                        aria-label={`${keyword.term} 상세 보기`}
                        onClick={() => setSelected(keyword)}
                      >
                        {keyword.term}
                        <span>{keyword.category}</span>
                      </button>
                    </td>
                    <td className="numeric">{formatNumber(keyword.monthlySearches)}</td>
                    <td>
                      <Growth value={keyword.growth} />
                    </td>
                    <td>
                      <span className={`competition competition-${keyword.competition}`}>
                        {competitionLabels[keyword.competition]}
                      </span>
                    </td>
                    <td>
                      <div className="score-cell">
                        <strong>{keyword.opportunity}</strong>
                        <div>
                          <span style={{ width: `${keyword.opportunity}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <Sparkline
                        values={keyword.trend}
                        label={`${keyword.term} 샘플 관심도`}
                        color={keyword.growth < 0 ? '#a0a69e' : '#7c9b8a'}
                      />
                    </td>
                    <td>
                      <button
                        className={`save-keyword ${saved(keyword) ? 'saved' : ''}`}
                        aria-label={`${keyword.term} ${saved(keyword) ? '글감에 저장됨' : '글감으로 저장'}`}
                        disabled={saved(keyword)}
                        onClick={() => setSaving(keyword)}
                      >
                        {saved(keyword) ? <Check size={16} /> : <Plus size={16} />}
                        {saved(keyword) ? '저장됨' : '글감 저장'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {keywords.length}개 DEMO 샘플 중 {filtered.length}개 표시
          </span>
          <span>
            <Sparkles size={13} />
            기회 점수는 예시 값입니다
          </span>
        </div>
      </section>
      <ResearchPanel />
      <div className="explainer-cards">
        <article>
          <TrendingUp size={20} />
          <div>
            <h3>검색 수요를 살펴보세요</h3>
            <p>검색량과 상승률을 함께 보면 독자의 관심 흐름을 이해할 수 있어요.</p>
          </div>
        </article>
        <article>
          <Sparkles size={20} />
          <div>
            <h3>나만의 관점을 더해보세요</h3>
            <p>좋은 키워드에 경험과 관점을 더하면 고유한 콘텐츠가 됩니다.</p>
          </div>
        </article>
      </div>
      {selected && (
        <Modal
          title={selected.term}
          description={`${selected.category} · ${selected.intent} · DEMO 샘플 데이터`}
          onClose={() => setSelected(null)}
        >
          <div className="keyword-detail-stats">
            <div>
              <span>월간 검색량</span>
              <strong>{formatNumber(selected.monthlySearches)}</strong>
            </div>
            <div>
              <span>상승률</span>
              <Growth value={selected.growth} />
            </div>
            <div>
              <span>기회 점수</span>
              <strong>
                {selected.opportunity}
                <small> / 100</small>
              </strong>
            </div>
          </div>
          <div className="detail-chart">
            <Sparkline values={selected.trend} label="샘플 관심도 추이" />
          </div>
          <h3 className="detail-subtitle">함께 살펴볼 연관 키워드</h3>
          <div className="related-keywords">
            {selected.related.map((term) => (
              <span className="keyword-tag" key={term}>
                {term}
              </span>
            ))}
          </div>
          <p className="form-note">분석 결과와 연관 키워드는 모두 가상 예시입니다.</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setSelected(null)}>
              닫기
            </button>
            <button
              className="button primary"
              disabled={saved(selected)}
              onClick={() => {
                setSaving(selected)
                setSelected(null)
              }}
            >
              <Plus size={16} />
              {saved(selected) ? '이미 글감에 저장됨' : '글감으로 만들기'}
            </button>
          </div>
        </Modal>
      )}
      {saving && (
        <IdeaForm
          initial={{ keyword: saving.term, category: saving.category }}
          onClose={() => setSaving(null)}
          onSaved={() => {
            setSaving(null)
            notify('키워드를 새 글감으로 저장했습니다.')
          }}
        />
      )}
    </>
  )
}
