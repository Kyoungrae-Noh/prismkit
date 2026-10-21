import { useState } from 'react'
import {
  discoveryRecommendation,
  type DiscoveryAnalysis,
  type DiscoveryCandidate,
} from '../domain/discovery'
import { emptyReview, type EditorialReview, type AnalysisApi } from '../domain/integrated-analysis'
import { HubEvidence } from './hub-evidence'
const labels: Record<AnalysisApi, string> = {
  searchad: '검색광고',
  blog: '블로그',
  cafe: '카페',
  trend: '검색어트렌드',
  shopping: '쇼핑인사이트',
}
export function IntegratedDetail({
  candidate: c,
  analysis: a,
  busy,
  expectedCalls,
  onAnalyze,
  onSave,
  onReview,
}: {
  candidate: DiscoveryCandidate
  analysis?: DiscoveryAnalysis
  busy: boolean
  expectedCalls: number
  onAnalyze(): void
  onSave(manuscript: boolean): void
  onReview(review: EditorialReview): void
}) {
  const [officialUrl, setOfficialUrl] = useState(''),
    [officialNote, setOfficialNote] = useState(''),
    [notice, setNotice] = useState('')
  const rec = discoveryRecommendation(c, a),
    review = a?.review ?? emptyReview
  function confirmOfficial() {
    try {
      const url = new URL(officialUrl)
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.href.length > 1000 ||
        officialNote.trim().length < 10 ||
        officialNote.trim().length > 1000
      )
        throw Error()
      onReview({
        ...review,
        official: { url: url.href, note: officialNote.trim(), checkedAt: new Date().toISOString() },
      })
      setNotice('사용자가 공식 원문을 확인한 기록입니다. 자동 사실 검증 결과가 아닙니다.')
    } catch {
      setNotice('HTTPS 공식 출처와 확인 내용 10자 이상을 입력하세요.')
    }
  }
  return (
    <section
      className="discovery-evidence integrated-detail"
      aria-label="통합 상세 분석"
      aria-busy={busy}
    >
      <h3>{c.title}</h3>
      <p>
        분석 키워드: <strong>{a?.keyword ?? c.keyword}</strong> ·{' '}
        {c.mode === 'DEMO' ? 'DEMO 모의 자료' : 'LIVE 조회'} · 핵심어의 지표이며 원본 제목 전체의
        수요와 다를 수 있습니다.
      </p>
      <div className="analysis-summary">
        <div>
          <span>월간 검색량</span>
          <strong>{a?.volume?.total ?? '미확인'}</strong>
          <small>
            최근 30일 · PC {a?.volume?.pc ?? '미확인'} / 모바일 {a?.volume?.mobile ?? '미확인'}
          </small>
        </div>
        <div>
          <span>블로그 API 결과 수</span>
          <strong>{a?.results.find((r) => r.api === 'blog')?.total ?? '미확인'}</strong>
        </div>
        <div>
          <span>카페 API 결과 수</span>
          <strong>{a?.results.find((r) => r.api === 'cafe')?.total ?? '미확인'}</strong>
        </div>
        <div>
          <span>상대 검색 관심도</span>
          <strong>{rec.trend.direction}</strong>
          <small>{rec.trend.message}</small>
        </div>
      </div>
      <p>
        API 결과 수는 통합검색 전체 문서 수·노출 순위·실제 경쟁 난이도가 아닙니다. 이전 결과가
        보존된 항목은 아래 조회 상태를 확인하세요.
      </p>
      <p className="analysis-verdict">
        <strong>{rec.status}</strong> ·{' '}
        {busy ? '분석 진행 중' : a ? '분석 완료 (부분 실패·자료 부족은 아래 표시)' : '미조회'}
      </p>
      <p>
        확인된 평가 가중치 {rec.coverage}% ·{' '}
        {rec.score === null
          ? `종합 점수 보류 (확인 항목 기여 ${rec.points}/${rec.coverage}점)`
          : `초기 검토 점수 ${rec.score}/100`}
      </p>
      <p>
        추천 이유:{' '}
        {rec.missing.length
          ? `미확인 — ${rec.missing.join(', ')}`
          : `핵심어 검색량 ${a?.volume?.total ?? '미확인'}회, 제목 표본 ${rec.competition.posts.length}건 중 핵심어 전체 포함 ${rec.competition.exactTitles}건, 상대 관심도 ${rec.trend.direction}. 사용자 적합성 판단을 포함한 초기 점수로 검토 순서를 정했습니다.`}
      </p>
      {rec.officialRequired && (
        <p className="notice">
          정책·금융·부동산은 공식 사실 확인이 필수입니다.{' '}
          {rec.officialChecked
            ? '사용자 확인 기록 있음'
            : '공식 출처·조건·기준일 확인 전 발행 판단을 보류합니다.'}
        </p>
      )}
      <p>
        예상 외부 호출:{' '}
        {c.mode === 'DEMO'
          ? '0회'
          : `최대 ${expectedCalls}회 (검색광고 1회 포함); 캐시 적중 시 감소`}
        . 제목·요약 분석과 가중치 계산은 로컬 처리입니다.
      </p>
      <div className="discovery-actions">
        <button className="button" disabled={busy || !a} onClick={() => onSave(false)}>
          후보 저장
        </button>
        <button
          className="button primary"
          disabled={busy || !a || c.mode === 'DEMO'}
          onClick={() => onSave(true)}
        >
          원고 제작
        </button>
        <button className="button" disabled={busy} onClick={onAnalyze}>
          분석 다시 실행
        </button>
      </div>
      <details className="discovery-advanced">
        <summary>근거 보기 · 조회 상태·시각</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>API</th>
                <th>상태</th>
                <th>데이터 조회 시각</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  'searchad',
                  'blog',
                  'cafe',
                  'trend',
                  ...(a?.states?.shopping ? ['shopping'] : []),
                ] as AnalysisApi[]
              ).map((api) => {
                const s = a?.states?.[api]
                return (
                  <tr key={api}>
                    <td>{labels[api]}</td>
                    <td>
                      {c.mode === 'DEMO' ? 'DEMO · ' : ''}
                      {c.mode === 'DEMO' && s?.state === 'LIVE 확인'
                        ? '모의 확인'
                        : (s?.state ?? '미조회')}
                      {s?.cached && s.state !== '캐시' ? ' · 캐시' : ''}
                      {s?.retained ? ' · 이전 자료 보존' : ''}
                    </td>
                    <td>{s?.at ?? '미조회'}</td>
                    <td>{s?.message ?? '아직 조회하지 않았습니다.'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p>연관 키워드: {a?.related.join(' · ') || '자료 없음 또는 미조회'}</p>
        <p>검색 의도 (로컬 추론): {rec.intent}</p>
        <p>
          비교 기간: {rec.trend.start ?? '미확인'} ~ {rec.trend.end ?? '미확인'} · 인접한 7일씩 비교
          · 상대 지표이며 실제 검색량 아님
        </p>
        <ul>
          {c.sources.map((s, i) => (
            <li key={i}>
              발굴 출처 {s.api} · {s.date ?? '제공일 없음'} · 조회 {s.collectedAt}
              {c.mode === 'LIVE' && s.url && (
                <>
                  {' '}
                  ·{' '}
                  <a href={s.url} target="_blank" rel="noreferrer">
                    원본 링크
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        <HubEvidence results={a?.results ?? []} />
      </details>
      <details className="discovery-advanced">
        <summary>상위 경쟁 글 분석 · API 제목·요약 기준</summary>
        <p>
          본문은 수집하지 않습니다. 아래 소주제·정보 공백은 API 제목·요약에서 관찰한 후보이며 본문에
          정보가 없다는 뜻이 아닙니다.
        </p>
        <p>
          반복 소주제:{' '}
          {rec.competition.repeated.map((t) => `${t.topic} (${t.count}건)`).join(' · ') ||
            '판별 자료 부족'}
        </p>
        <p>추가 확인할 정보 후보: {rec.competition.absent.join(' · ') || '판별 자료 부족'}</p>
        <ol>
          {rec.competition.outline.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {rec.competition.posts.map((p, i) => (
          <article key={`${p.api}:${i}`}>
            <strong>{p.title}</strong>
            <p>
              API 순서 {p.apiPosition} · {p.api} · {p.freshness} · 조회 {p.collectedAt}
            </p>
            <p>
              제목 포함어: {p.terms.join(', ') || '직접 일치 없음'} · 의도 추론: {p.intent}
            </p>
            <p>{p.description}</p>
            {c.mode === 'LIVE' && (
              <a href={p.url} target="_blank" rel="noreferrer">
                API 제공 링크
              </a>
            )}
          </article>
        ))}
      </details>
      <details className="discovery-advanced">
        <summary>평가 근거·사용자 확인 (외부 호출 없음)</summary>
        <p>
          검증된 성과 모델이 아닌 초기 실험 설정입니다. 결측값은 0점으로 간주하거나 가중치를
          재배분하지 않습니다. 상위 노출·수익을 보장하지 않습니다.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>항목</th>
                <th>가중치</th>
                <th>점수</th>
                <th>출처·산식</th>
              </tr>
            </thead>
            <tbody>
              {rec.components.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{s.weight}%</td>
                  <td>{s.value ?? '미확인'}</td>
                  <td>
                    {s.source} · {s.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="discovery-settings">
          <label>
            Reviewman 수익화 적합성
            <select
              disabled={!a || busy}
              value={review.reviewman}
              onChange={(e) =>
                onReview({ ...review, reviewman: e.target.value as EditorialReview['reviewman'] })
              }
            >
              <option value="unknown">미확인</option>
              <option value="fit">적합 (사용자 검토)</option>
              <option value="unfit">비적합 (사용자 검토)</option>
            </select>
          </label>
          <label>
            Reviewman 활용 근거
            <input
              disabled={!a || busy}
              maxLength={500}
              value={review.note}
              onChange={(e) => onReview({ ...review, note: e.target.value })}
              placeholder="연결할 콘텐츠·광고·제휴 적합성의 구체적 근거"
            />
          </label>
        </div>
        {rec.officialRequired && (
          <>
            <p>
              직접 연 공식 원문의 조건·기준일·사실을 확인한 뒤 기록하세요. 링크 입력만으로 사실이
              검증되지는 않습니다.
            </p>
            <div className="discovery-settings">
              <label>
                공식 출처 URL
                <input
                  disabled={!a || busy}
                  maxLength={1000}
                  value={officialUrl}
                  onChange={(e) => setOfficialUrl(e.target.value)}
                />
              </label>
              <label>
                공식 원문 확인 내용
                <input
                  disabled={!a || busy}
                  maxLength={1000}
                  value={officialNote}
                  onChange={(e) => setOfficialNote(e.target.value)}
                />
              </label>
            </div>
            <button className="button" disabled={!a || busy} onClick={confirmOfficial}>
              공식 확인 기록
            </button>
            {review.official && (
              <p>
                사용자 확인: {review.official.url} · {review.official.note}
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => onReview({ ...review, official: null })}
                >
                  확인 취소
                </button>
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
          </>
        )}
      </details>
    </section>
  )
}
