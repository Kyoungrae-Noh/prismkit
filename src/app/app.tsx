import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Plug,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useWorkspace } from './workspace'
import { Dashboard } from '../pages/dashboard'
import { Ideas } from '../pages/ideas'
import { Keywords } from '../pages/keywords'
import { Connections } from '../pages/connections'
import { IdeaForm } from '../components/idea-form'
import { EmptyState, Modal } from '../components/ui'

const navigation = [
  { path: '/', label: '대시보드', icon: LayoutDashboard },
  { path: '/ideas', label: '글감 관리', icon: FilePenLine },
  { path: '/keywords', label: '키워드 분석', icon: Search },
  { path: '/connections', label: '데이터 연결', icon: Plug },
]
export function App() {
  const { ideas, loading, error, refresh } = useWorkspace()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [guide, setGuide] = useState(false)
  const [toast, setToast] = useState('')
  const mainRef = useRef<HTMLElement>(null)
  const current = navigation.find((item) => item.path === location.pathname)?.label ?? '페이지 없음'
  useEffect(() => {
    document.title = `${current} · Prismkit`
    setMenuOpen(false)
    mainRef.current?.focus()
    window.scrollTo({ top: 0 })
  }, [location.pathname, current])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    if (!menuOpen) return
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [menuOpen])
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside id="primary-sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Link to="/" className="brand" aria-label="Prismkit 대시보드">
          <span className="brand-mark">
            p<span />
          </span>
          <span>
            prismkit<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>내 워크스페이스</strong>
            <span>Personal workspace</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="주요 메뉴">
          {navigation.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenuOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
              {path === '/ideas' && (
                <span className="nav-count">{loading ? '–' : ideas.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Lightbulb size={20} />
            </span>
            <strong>작은 생각이, 좋은 콘텐츠로.</strong>
            <p>
              오늘 떠오른 아이디어 하나를
              <br />
              기록해보는 건 어떨까요?
            </p>
            <button
              onClick={() => {
                setMenuOpen(false)
                setGuide(true)
              }}
            >
              Prismkit 시작 가이드 <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="version-dot" />
            Phase 0 <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={menuOpen}
              aria-controls="primary-sidebar"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <span>워크스페이스</span>
            <ChevronRight size={13} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-label">
              <span />
              샘플 워크스페이스
            </span>
            <div className="topbar-divider" />
            <span className="profile-avatar" title="로컬 관리자 워크스페이스">
              P
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} ref={mainRef} className="main-content">
          {loading ? (
            <div className="loading-state" role="status">
              <span className="loading-ring" />
              워크스페이스를 불러오는 중…
            </div>
          ) : error ? (
            <div role="alert">
              <EmptyState
                title="워크스페이스를 불러오지 못했어요"
                description={error}
                action={
                  <button className="button primary" onClick={() => void refresh()}>
                    다시 시도
                  </button>
                }
              />
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard onCreate={() => setCreating(true)} />} />
              <Route
                path="/ideas"
                element={<Ideas onCreate={() => setCreating(true)} notify={setToast} />}
              />
              <Route path="/keywords" element={<Keywords notify={setToast} />} />
              <Route path="/connections" element={<Connections />} />
              <Route
                path="*"
                element={
                  <EmptyState
                    title="페이지를 찾을 수 없어요"
                    description="주소를 확인하거나 대시보드로 돌아가세요."
                    action={
                      <Link className="button primary" to="/">
                        대시보드로 이동
                      </Link>
                    }
                  />
                }
              />
            </Routes>
          )}
          <footer className="page-footer">
            <span>
              prismkit<span className="orange-text">.</span> <span>생각에 방향을 더하다</span>
            </span>
            <span>로컬 저장 · 샘플 데이터</span>
          </footer>
        </main>
      </div>
      {creating && (
        <IdeaForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            setToast('새 글감을 추가했습니다.')
          }}
        />
      )}
      {guide && (
        <Modal
          title="Prismkit 시작 가이드"
          description="키워드에서 나만의 콘텐츠까지, 세 단계로 시작하세요."
          onClose={() => setGuide(false)}
        >
          <ol className="guide-steps">
            <li>
              <span>
                <Search size={20} />
              </span>
              <div>
                <h3>관심 키워드 발견하기</h3>
                <p>키워드 분석에서 샘플 검색량과 관심도 흐름을 탐색해보세요.</p>
              </div>
            </li>
            <li>
              <span>
                <Lightbulb size={20} />
              </span>
              <div>
                <h3>아이디어를 글감으로 모으기</h3>
                <p>새 글감을 추가하고 제목, 핵심 키워드, 메모를 기록하세요.</p>
              </div>
            </li>
            <li>
              <span>
                <Sparkles size={20} />
              </span>
              <div>
                <h3>콘텐츠 진행 상황 관리하기</h3>
                <p>
                  글감을 열어 작성 예정, 작성 중, 발행 완료로 상태를 바꿔보세요. 실제 발행이나 AI
                  생성은 실행되지 않습니다.
                </p>
              </div>
            </li>
          </ol>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setGuide(false)}>
              시작하기 <ArrowUpRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
