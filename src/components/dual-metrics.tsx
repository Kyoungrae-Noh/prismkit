import type { DiscoveryAnalysis } from '../domain/discovery'
export function MetricValue({
  analysis: a,
  api,
  mode,
}: {
  analysis?: DiscoveryAnalysis
  api: 'searchad' | 'blog' | 'cafe'
  mode: 'LIVE' | 'DEMO'
}) {
  const s = a?.states?.[api]
  const value = api === 'searchad' ? a?.volume?.total : a?.results.find((r) => r.api === api)?.total
  return (
    <>
      <strong>{value ?? (s && s.state !== '미조회' ? '미확인' : '미조회')}</strong>
      <small>
        {mode === 'DEMO' ? 'DEMO · ' : ''}
        {mode === 'DEMO' && s?.state === 'LIVE 확인' ? '모의 확인' : (s?.state ?? '미조회')}
        {s?.retained ? ' · 이전 값' : ''}
      </small>
    </>
  )
}
export function DualMetrics({
  main,
  detail,
  mainKeyword,
  detailKeyword,
  mode,
}: {
  main?: DiscoveryAnalysis
  detail?: DiscoveryAnalysis
  mainKeyword: string
  detailKeyword: string
  mode: 'LIVE' | 'DEMO'
}) {
  return (
    <section className="dual-detail" aria-label="메인·세부 비교">
      <h3>메인·세부 키워드 비교</h3>
      <p>
        키워드는 원본 제목 기반 규칙 추론입니다. 메인은 시장 규모, 세부는 글의 의도를 검토합니다.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>구분·키워드</th>
              <th>PC / 모바일</th>
              <th>합계</th>
              <th>블로그</th>
              <th>카페</th>
              <th>출처·조회 시각</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: '메인', keyword: mainKeyword, a: main },
              { label: '세부', keyword: detailKeyword, a: detail },
            ].map(({ label, keyword, a }) => (
              <tr key={label}>
                <td>
                  {label}
                  <br />
                  <strong>{keyword}</strong>
                </td>
                <td>
                  {a?.volume?.pc ?? '미확인'} / {a?.volume?.mobile ?? '미확인'}
                </td>
                <td>
                  <MetricValue analysis={a} api="searchad" mode={mode} />
                </td>
                <td>
                  <MetricValue analysis={a} api="blog" mode={mode} />
                </td>
                <td>
                  <MetricValue analysis={a} api="cafe" mode={mode} />
                </td>
                <td>
                  검색광고: {a?.volumeAt ?? '미조회'}
                  <br />
                  HUB:{' '}
                  {a?.results
                    .filter((r) => r.api === 'blog' || r.api === 'cafe')
                    .map((r) => `${r.api} ${r.collectedAt}`)
                    .join(' / ') || '미조회'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        API 결과 수는 실제 노출 경쟁도·상위 노출 확률이 아닙니다. 저장 자료는 원래 조회 시각
        기준입니다.
      </p>
    </section>
  )
}
