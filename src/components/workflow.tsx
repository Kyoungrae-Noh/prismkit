import { Link, useLocation } from 'react-router-dom'

export function Workflow() {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const suffix = params.size ? `?${params}` : ''
  const stages = [
    { label: '글감 등록', path: '/ideas', routes: ['/ideas', '/captures'] },
    { label: '분석', path: '/keywords', routes: ['/keywords', '/recommendations'] },
    { label: '원고 제작', path: '/manuscripts', routes: ['/manuscripts'] },
    { label: '발행 준비', path: '/publishing', routes: ['/publishing'] },
  ]
  if (!stages.some((s) => s.routes.includes(pathname))) return null
  const related =
    pathname === '/ideas' || pathname === '/captures'
      ? [
          ['/ideas', '등록한 글감'],
          ['/captures', '캡처로 등록'],
        ]
      : ['/keywords', '/recommendations', '/publishing'].includes(pathname)
        ? [
            ['/keywords', '검색량·후보'],
            ['/publishing', '경쟁 자료·발행 이력'],
            ['/recommendations', '추천 근거 비교'],
          ]
        : []
  return (
    <div className="workflow-shell">
      <nav aria-label="콘텐츠 작업 단계" className="workflow-steps">
        {stages.map((s, i) => (
          <Link
            key={s.path}
            to={s.path + suffix}
            aria-current={s.routes.includes(pathname) ? 'step' : undefined}
          >
            <span>{i + 1}</span>
            {s.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="단계별 도구" className="workflow-tools">
        {related.map(([path, label]) => (
          <Link key={path} to={path + suffix}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
