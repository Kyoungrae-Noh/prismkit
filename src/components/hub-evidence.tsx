import { trendDirection } from '../domain/discovery'
import { hubLabels, type HubResult } from '../providers/hub-types'
function plain(s: string) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
export function HubEvidence({ results }: { results: HubResult[] }) {
  return (
    <>
      {' '}
      {results.map((r) => (
        <details key={r.api}>
          <summary>
            {hubLabels[r.api]} · {r.mode} · 조회 {r.collectedAt}
          </summary>
          <p>
            {r.unit === 'api-results'
              ? `해당 API 검색 결과 ${r.total ?? '미확인'}건 · API 순서이며 실제 통합검색 순위 아님`
              : `상대 지표 0–100 · ${r.startDate} ~ ${r.endDate} · ${r.device} · 검색량·매출·전환율 아님`}
          </p>
          {r.items.map((i) => (
            <article key={i.url}>
              <strong>
                {i.apiPosition}. {plain(i.title)}
              </strong>
              <p>{plain(i.description)}</p>
              <p>
                {plain(i.source)} · {i.date ?? '작성일 미제공'}
              </p>
              {r.mode === 'LIVE' && (
                <a href={i.originalUrl ?? i.url} target="_blank" rel="noreferrer">
                  원본 출처
                </a>
              )}
            </article>
          ))}
          {r.series.map((s) => (
            <div key={s.title}>
              <p>
                {s.title} · {trendDirection(s)}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>기간</th>
                      <th>상대 관심도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.points.map((p) => (
                      <tr key={p.date}>
                        <td>{p.date}</td>
                        <td>{p.ratio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </details>
      ))}
    </>
  )
}
