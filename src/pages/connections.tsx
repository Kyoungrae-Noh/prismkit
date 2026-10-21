import { sourceAudits } from '../providers/catalog'
import {
  ArrowRight,
  Bot,
  ChartNoAxesCombined,
  Check,
  Database,
  HardDrive,
  Info,
  Plug,
  Search,
} from 'lucide-react'
import { useWorkspace } from '../app/workspace'
import { Link } from 'react-router-dom'

export function Connections() {
  const { connections } = useWorkspace()
  const icons = { search: Search, analytics: ChartNoAxesCombined, ai: Bot }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONNECTED WORKSPACE</div>
          <h1>
            데이터 연결<span className="accent-dot">.</span>
          </h1>
          <p>콘텐츠의 방향을 알려줄 데이터를 한곳에서 관리하세요.</p>
        </div>
      </div>
      <div className="connection-overview">
        <div className="connection-illustration">
          <Database size={31} />
          <span>
            <Plug size={16} />
          </span>
        </div>
        <div>
          <span className="eyebrow">차근차근 연결하는 가능성</span>
          <h2>수동 자료 저장과 데이터 소스 검증</h2>
          <p>
            실제 API 조회와 수동 입력·DEMO 자료를 구분하여 사용합니다.
            <br />
            글감 발굴과 키워드 분석에서 연결 상태와 조회 결과를 확인하세요.
          </p>
        </div>
        <span className="connection-count">
          {sourceAudits.filter((source) => source.verification === 'VERIFIED').length}{' '}
          <small>개 API 인증 확인</small>
        </span>
      </div>
      <section className="research-panel panel" aria-label="데이터 소스 검증 현황">
        <h2>공식 데이터 소스 검증 현황</h2>
        <p>검색광고 인증 확인 · 키워드 화면에서 실제 검색량 조회 지원</p>
        <p>
          API HUB 6종: 실제 인증 성공 · 개인 Prismkit 이용 허가 사용자 확인.{' '}
          <Link to="/ideas">글감 발굴·연결 상태 확인</Link>
        </p>
        <div className="research-grid">
          {sourceAudits.map((source) => (
            <article key={source.id}>
              <h3>{source.name}</h3>
              <span className="subtle-badge">{source.verification}</span>
              <p>{source.note}</p>
              <p>
                문서 확인: {source.checkedDate} · 인증 테스트:{' '}
                {source.authenticatedTestAt ? '성공' : '미실시'}
              </p>
              <a href={source.documentation} target="_blank" rel="noreferrer">
                공식 문서 보기 ↗
              </a>
            </article>
          ))}
        </div>
      </section>
      <section className="connections-grid" aria-label="연결 가능한 데이터 소스">
        {connections.map((connection) => {
          const Icon = icons[connection.kind]
          return (
            <article className="panel connection-card" key={connection.id}>
              <div className="connection-card-top">
                <span className={`provider-icon provider-${connection.id}`}>
                  <Icon size={25} />
                </span>
                <span className="subtle-badge">연결 예정</span>
              </div>
              <h2>{connection.name}</h2>
              <p>{connection.description}</p>
              <div className="connection-features">
                {(connection.kind === 'search'
                  ? ['검색량·연관 키워드', '키워드 관심도 변화']
                  : connection.kind === 'analytics'
                    ? ['콘텐츠 검색 성과', '노출·클릭 데이터']
                    : ['콘텐츠 개요 제안', '초안 작성 지원']
                ).map((feature) => (
                  <span key={feature}>
                    <Check size={14} />
                    {feature}
                  </span>
                ))}
              </div>
              <button className="button secondary" disabled>
                다음 Phase에서 제공 <ArrowRight size={15} />
              </button>
            </article>
          )
        })}
      </section>
      <section className="panel local-storage-panel">
        <span className="storage-icon">
          <HardDrive size={24} />
        </span>
        <div>
          <h2>
            브라우저 로컬 저장소{' '}
            <span className="status status-published">
              <span />
              사용 중
            </span>
          </h2>
          <p>
            추가하거나 수정한 글감은 현재 브라우저에 저장됩니다. 다른 기기와 동기화되지 않으며
            브라우저 데이터 삭제 시 사라집니다.
          </p>
        </div>
      </section>
      <div className="notice">
        <Info size={17} />
        <span>API 인증정보는 서버에서 관리합니다. 화면에 비밀키를 입력할 필요가 없습니다.</span>
      </div>
    </>
  )
}
