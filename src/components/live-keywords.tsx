import { useState, type FormEvent } from 'react'
import { createSearchAdProvider } from '../providers/searchad-client'
import type { SearchAdResponse } from '../providers/searchad-types'
import { displayCount } from '../domain/research'
const provider = createSearchAdProvider()
export function LiveKeywords({
  onData,
}: {
  onData?: (keyword: string, data: SearchAdResponse) => void
}) {
  const [keyword, setKeyword] = useState(''),
    [data, setData] = useState<SearchAdResponse | null>(null),
    [queried, setQueried] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sort, setSort] = useState('total')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setData(null)
    try {
      const response = await provider.query(keyword.trim())
      setData(response)
      onData?.(keyword.trim(), response)
      setQueried(keyword.trim())
    } catch (error) {
      setError(error instanceof Error ? error.message : '조회에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }
  const rows = data
    ? [...data.rows].sort((a, b) => {
        const key = sort as 'pc' | 'mobile' | 'total'
        const av = a[key],
          bv = b[key]
        return (
          (typeof bv === 'number' ? bv : -1) - (typeof av === 'number' ? av : -1) ||
          a.keyword.localeCompare(b.keyword, 'ko')
        )
      })
    : []
  return (
    <section className="panel research-panel" aria-label="검색광고 실시간 조회">
      <h2>검색광고 검색량 조회</h2>
      <p>
        최근 30일 PC·모바일 검색량과 검색광고 도구의 연관 키워드입니다. 네이버 검색창
        자동완성·연관검색어와는 다릅니다.
      </p>
      <form className="idea-form" onSubmit={submit}>
        <label>
          조회할 키워드
          <input
            required
            maxLength={60}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="예: 온누리상품권"
            disabled={busy}
          />
        </label>
        <button className="button primary" disabled={busy || !keyword.trim()}>
          {busy ? '조회 중…' : '검색량 조회'}
        </button>
      </form>
      <p className="form-note">
        버튼을 누를 때만 조회합니다. 동일 키워드는 5분 캐시를 사용하며, 최소 10초 간격입니다.
        {import.meta.env.DEV
          ? ' 로컬 서버 실행당 최대 10회입니다.'
          : ' 운영 호출 예산은 총 10회이며 자동 초기화되지 않습니다.'}{' '}
        별도 과금 여부는 미확정이며 자동 조회하지 않습니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <div aria-live="polite">
          <h3>조회 결과: {queried}</h3>
          <p>
            <span className="subtle-badge">LIVE · VERIFIED</span>{' '}
            {data.cached ? '캐시된 실제 응답' : '실제 API 응답'}
          </p>
          <p>
            출처: {data.volume.source.label} · 조회 시각:{' '}
            <time dateTime={data.volume.collectedAt!}>
              {new Date(data.volume.collectedAt!).toLocaleString('ko-KR')}
            </time>
          </p>
          <dl className="research-metrics">
            <div>
              <dt>조회 키워드 PC 검색량</dt>
              <dd>{displayCount(data.volume.data?.pc ?? null)}</dd>
            </div>
            <div>
              <dt>조회 키워드 모바일 검색량</dt>
              <dd>{displayCount(data.volume.data?.mobile ?? null)}</dd>
            </div>
            <div>
              <dt>조회 키워드 검색량 합계</dt>
              <dd>{displayCount(data.volume.data?.total ?? null)}</dd>
            </div>
          </dl>
          {!data.volume.data && (
            <p>
              일치하는 조회 키워드의 검색량은 확인 불가입니다. 다른 키워드의 값을 대신 사용하지
              않습니다.
            </p>
          )}
          <p>
            연관 키워드 {data.expansion.data?.keywords.length ?? 0}개 · 조회 키워드 포함 전체{' '}
            {data.rows.length}개 중 상위 {Math.min(50, rows.length)}개 표시
          </p>
          <label>
            실제 검색량 정렬{' '}
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="total">합계 높은 순</option>
              <option value="pc">PC 높은 순</option>
              <option value="mobile">모바일 높은 순</option>
            </select>
          </label>
          <div className="table-scroll">
            <table className="keyword-table">
              <thead>
                <tr>
                  <th>검색광고 키워드</th>
                  <th>PC</th>
                  <th>모바일</th>
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, index) => (
                  <tr key={`${row.keyword}-${index}`}>
                    <td>{row.keyword}</td>
                    <td>{displayCount(row.pc)}</td>
                    <td>{displayCount(row.mobile)}</td>
                    <td>{displayCount(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="form-note">
            &lt;10은 범위값 그대로 표시합니다. 정확한 합계가 없으면 확인 불가이며 정렬 마지막에
            둡니다. LIVE는 인증 응답 확인을 뜻하며 경쟁력이나 발행 추천을 의미하지 않습니다.
          </p>
        </div>
      )}
    </section>
  )
}
