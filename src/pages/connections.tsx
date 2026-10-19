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
          <h2>지금은 샘플로, 다음은 나의 데이터로.</h2>
          <p>
            현재 워크스페이스는 샘플 데이터로 동작합니다.
            <br />
            외부 서비스와의 연결은 다음 단계에서 제공됩니다.
          </p>
        </div>
        <span className="connection-count">
          0 <small>/ {connections.length} 연결됨</small>
        </span>
      </div>
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
        <span>
          현재 API 키를 입력할 필요가 없습니다. 외부 서비스 연결 시 사용할 인증과 비밀정보 관리는
          서버 구성과 함께 추가됩니다.
        </span>
      </div>
    </>
  )
}
