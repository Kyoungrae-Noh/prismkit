import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  FilePenLine,
  Lightbulb,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../app/workspace'
import { formatDate, formatNumber, Growth, Sparkline, StatusBadge } from '../components/ui'
import { statuses, statusLabels } from '../domain/models'

export function Dashboard({ onCreate }: { onCreate(): void }) {
  const { ideas, keywords } = useWorkspace()
  const [period, setPeriod] = useState('30')
  const counts = statuses.map((status) => ideas.filter((idea) => idea.status === status).length)
  const opportunityCount = keywords.filter((keyword) => keyword.opportunity >= 80).length
  const metrics = [
    {
      title: '보관 중인 글감',
      value: ideas.length,
      unit: '개',
      detail: '떠오른 생각을 한곳에',
      icon: Lightbulb,
      tone: 'orange',
    },
    {
      title: '탐색 가능한 키워드',
      value: keywords.length,
      unit: '개',
      detail: '다음 콘텐츠의 시작점',
      icon: Search,
      tone: 'green',
    },
    {
      title: '작성 중인 콘텐츠',
      value: counts[2],
      unit: '개',
      detail: '아이디어가 글이 되는 중',
      icon: FilePenLine,
      tone: 'purple',
    },
    {
      title: '발견한 기회',
      value: opportunityCount,
      unit: '개',
      detail: '기회 점수 80점 이상 · DEMO',
      icon: TrendingUp,
      tone: 'blue',
    },
  ]
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CONTENT, IN FOCUS</div>
          <h1>
            콘텐츠의 다음 기회를 발견하세요<span className="accent-dot">.</span>
          </h1>
          <p>흩어진 아이디어를 모으고, 데이터로 콘텐츠의 방향을 찾아보세요.</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={18} />새 글감 추가
        </button>
      </div>
      <section className="welcome-banner" aria-label="워크스페이스 안내">
        <div className="welcome-copy">
          <span className="welcome-kicker">
            <span className="live-dot" /> 생각에서 콘텐츠까지
          </span>
          <h2>
            좋은 콘텐츠의 시작,
            <br />
            Prismkit과 함께.
          </h2>
          <p>
            키워드를 발견하고, 글감을 정리하고.
            <br />
            나만의 콘텐츠 흐름을 만들어보세요.
          </p>
          <Link to="/keywords" className="welcome-link">
            키워드 둘러보기 <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-card art-card-back">
            <span className="art-card-icon">
              <Lightbulb size={19} />
            </span>
            <span>작은 아이디어</span>
            <div className="art-line" />
            <div className="art-line short" />
          </div>
          <div className="art-card art-card-front">
            <div className="art-card-heading">
              <span className="art-card-icon">
                <TrendingUp size={19} />
              </span>
              <span>새로운 가능성</span>
              <ArrowUpRight size={17} />
            </div>
            <svg viewBox="0 0 180 60">
              <path
                d="M0 52L24 43L45 47L67 30L89 36L112 18L136 24L158 9L180 3"
                fill="none"
                stroke="#ea9263"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M0 52L24 43L45 47L67 30L89 36L112 18L136 24L158 9L180 3V60H0Z"
                fill="#ea9263"
                opacity=".08"
              />
            </svg>
            <div className="art-card-foot">
              <span>발견에서 실행으로</span>
              <Check size={14} />
            </div>
          </div>
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✦</span>
          <span className="art-pill">
            <Sparkles size={14} /> 다음 이야기를 발견하다
          </span>
        </div>
      </section>
      <section className="metrics-grid" aria-label="워크스페이스 현황">
        {metrics.map(({ title, value, unit, detail, icon: Icon, tone }) => (
          <article className="metric-card" key={title}>
            <div className="metric-top">
              <span>{title}</span>
              <span className={`metric-icon ${tone}`}>
                <Icon size={18} />
              </span>
            </div>
            <div className="metric-value">
              {formatNumber(value)}
              <span>{unit}</span>
            </div>
            <p>{detail}</p>
          </article>
        ))}
      </section>
      <div className="dashboard-middle">
        <section className="panel trend-panel">
          <div className="section-heading">
            <div>
              <h2>
                키워드 관심도 흐름 <span className="subtle-badge">DEMO</span>
              </h2>
              <p>주요 키워드의 상대적인 관심도 변화</p>
            </div>
            <select
              className="compact-select"
              aria-label="관심도 기간"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="30">최근 30일 예시</option>
              <option value="7">최근 7일 예시</option>
            </select>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot orange-dot" />
              AI 생산성 도구
            </span>
            <span>
              <i className="legend-dot green-dot" />
              모닝 루틴
            </span>
          </div>
          <div className="line-chart">
            <div className="chart-axis">
              <span>100</span>
              <span>75</span>
              <span>50</span>
              <span>25</span>
              <span>0</span>
            </div>
            <svg
              viewBox="0 0 600 155"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${period}일 샘플 관심도. AI 생산성 도구와 모닝 루틴의 상대 관심도가 증가하는 예시.`}
            >
              <defs>
                <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#e58b54" stopOpacity=".13" />
                  <stop offset="1" stopColor="#e58b54" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[2, 39, 76, 113, 150].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="600"
                  y2={y}
                  stroke="#eceee9"
                  strokeDasharray="4 4"
                />
              ))}
              <path
                d={
                  period === '30'
                    ? 'M0 127L55 116L109 122L164 99L218 107L273 78L327 89L382 58L436 65L491 42L545 50L600 19V150H0Z'
                    : 'M0 102L100 95L200 108L300 70L400 78L500 44L600 22V150H0Z'
                }
                fill="url(#trend-fill)"
              />
              <polyline
                points={
                  period === '30'
                    ? '0,127 55,116 109,122 164,99 218,107 273,78 327,89 382,58 436,65 491,42 545,50 600,19'
                    : '0,102 100,95 200,108 300,70 400,78 500,44 600,22'
                }
                fill="none"
                stroke="#e28b56"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <polyline
                points={
                  period === '30'
                    ? '0,138 55,127 109,134 164,116 218,121 273,112 327,103 382,109 436,92 491,84 545,94 600,70'
                    : '0,132 100,124 200,132 300,106 400,112 500,83 600,70'
                }
                fill="none"
                stroke="#7c9b8a"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="chart-dates">
            {(period === '30'
              ? ['09.01', '09.06', '09.11', '09.16', '09.21', '09.30']
              : ['09.24', '09.25', '09.26', '09.27', '09.28', '09.30']
            ).map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <p className="chart-footnote">2026년 9월의 가상 데이터 · 실제 검색 통계가 아닙니다.</p>
        </section>
        <section className="panel pipeline-panel">
          <div className="section-heading">
            <div>
              <h2>콘텐츠 진행 현황</h2>
              <p>한 걸음씩, 발행을 향해</p>
            </div>
            <BookOpen size={19} className="muted" />
          </div>
          <div className="pipeline-total">
            <strong>{ideas.length}</strong>
            <span>전체 글감</span>
          </div>
          <div className="pipeline-bar" aria-label={`전체 글감 ${ideas.length}개`}>
            {statuses.map((status, index) => (
              <span className={`pipeline-${status}`} style={{ flex: counts[index] }} key={status} />
            ))}
          </div>
          <div className="pipeline-rows">
            {statuses.map((status, index) => (
              <Link to={`/ideas?status=${status}`} key={status}>
                <span>
                  <i className={`pipeline-dot pipeline-${status}`} />
                  {statusLabels[status]}
                </span>
                <strong>
                  {counts[index]}
                  <ChevronRight size={15} />
                </strong>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="opportunities">
        <div className="section-heading">
          <div>
            <h2>
              <Sparkles size={19} className="orange-text" /> 눈여겨볼 키워드
            </h2>
            <p>검색 수요와 경쟁도를 살펴보는 연습을 시작해보세요.</p>
          </div>
          <Link className="text-link" to="/keywords">
            전체 키워드 <ArrowRight size={15} />
          </Link>
        </div>
        <div className="opportunity-grid">
          {[...keywords]
            .sort((a, b) => b.opportunity - a.opportunity)
            .slice(0, 4)
            .map((keyword) => (
              <Link
                className="opportunity-card"
                key={keyword.id}
                to={`/keywords?keyword=${encodeURIComponent(keyword.term)}`}
              >
                <div className="opportunity-top">
                  <span className="category-label">{keyword.category}</span>
                  <ArrowUpRight size={16} />
                </div>
                <h3>{keyword.term}</h3>
                <div className="opportunity-stats">
                  <div>
                    <span className="small-muted">월간 검색량 · DEMO</span>
                    <strong>{formatNumber(keyword.monthlySearches)}</strong>
                  </div>
                  <Sparkline values={keyword.trend} label={`${keyword.term} 샘플 추세`} />
                </div>
                <div className="opportunity-bottom">
                  <span className="opportunity-score">
                    기회 점수 <b>{keyword.opportunity}</b>
                  </span>
                  <Growth value={keyword.growth} />
                </div>
              </Link>
            ))}
        </div>
      </section>
      <section className="panel recent-panel">
        <div className="section-heading">
          <div>
            <h2>최근 작업한 글감</h2>
            <p>떠오른 생각의 다음 페이지를 이어가세요.</p>
          </div>
          <Link className="text-link" to="/ideas">
            모든 글감 <ArrowRight size={15} />
          </Link>
        </div>
        {ideas.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>글감 제목</th>
                  <th>키워드</th>
                  <th>진행 상태</th>
                  <th>최근 수정</th>
                </tr>
              </thead>
              <tbody>
                {ideas.slice(0, 4).map((idea) => (
                  <tr key={idea.id}>
                    <td>
                      <Link className="table-title" to={`/ideas?edit=${idea.id}`}>
                        <FilePenLine size={16} />
                        {idea.title}
                      </Link>
                    </td>
                    <td>
                      <span className="keyword-tag">{idea.keyword}</span>
                    </td>
                    <td>
                      <StatusBadge status={idea.status} />
                    </td>
                    <td className="muted">{formatDate(idea.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inline-empty">아직 글감이 없습니다. 첫 번째 아이디어를 기록해보세요.</div>
        )}
      </section>
    </>
  )
}
