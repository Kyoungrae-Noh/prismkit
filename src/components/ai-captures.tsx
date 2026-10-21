import { useEffect, useRef, useState } from 'react'
import { type CaptureData, draftsFromAI } from '../domain/captures'
import {
  AI_MODEL,
  AI_PROVIDER,
  AI_RESERVE_USD,
  type AIResult,
  type AIStatus,
} from '../domain/ai-contract'
import { createCaptureStore } from '../data/capture-store'
import { imageVault } from '../data/capture-images'
import { AIClientError, extractImage, fetchAIStatus } from '../providers/ai-client'

export function AICaptures({
  data,
  onData,
  onBusy,
}: {
  data: CaptureData
  onData: (data: CaptureData) => void
  onBusy: (busy: boolean) => void
}) {
  const [status, setStatus] = useState<AIStatus | null>(null),
    [checking, setChecking] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('')
  const active = useRef(true),
    running = useRef(false),
    pending = useRef(new Map<string, AIResult>())
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const store = createCaptureStore(localStorage)
  async function check(clearError = true) {
    setChecking(true)
    if (clearError) setError('')
    try {
      const s = await fetchAIStatus()
      if (active.current) setStatus(s)
    } catch (e) {
      if (active.current) {
        setStatus(null)
        setError(e instanceof Error ? e.message : 'AI 상태 확인 실패')
      }
    } finally {
      if (active.current) setChecking(false)
    }
  }
  function commit(id: string, result: AIResult) {
    const current = store.read(),
      image = current.images.find((i) => i.id === id)
    if (!image) throw new Error('원본 이미지가 삭제되어 결과를 저장하지 않았습니다.')
    // Only append, never replace existing reviewed drafts. Read after the network request.
    const drafts = draftsFromAI(result)
    image.analysis = {
      status: 'success',
      provider: result.provider,
      model: result.model,
      at: result.at,
      message: `${drafts.length}개 추출 · 사용자 검토 필요`,
      reservedUsd: result.reservedUsd,
    }
    current.drafts.push(...drafts)
    store.write(current)
    pending.current.delete(id)
    if (active.current) onData(current)
  }
  async function analyze(ids: string[], retry = false) {
    if (running.current || !status?.connected || !consent || !ids.length || ids.length > 20) return
    running.current = true
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      for (let n = 0; n < ids.length; n++) {
        if (!active.current) break
        const id = ids[n]
        setNotice(`AI 판독 ${n + 1}/${ids.length} · 원본 유지`)
        try {
          const cached = pending.current.get(id)
          if (cached) {
            commit(id, cached)
            continue
          }
          const current = store.read(),
            image = current.images.find((i) => i.id === id)
          if (!image) throw new Error('원본 이미지를 찾을 수 없습니다.')
          if (image.analysis?.status === 'success') continue
          image.analysis = {
            status: 'running',
            provider: AI_PROVIDER,
            model: AI_MODEL,
            at: new Date().toISOString(),
            message: '처리 중 · 화면 이동 후에는 상태 확인 필요',
            reservedUsd: null,
          }
          store.write(current)
          onData(current)
          const blob = await imageVault.get(id)
          if (!active.current) break
          const result = await extractImage(id, blob, retry)
          pending.current.set(id, result)
          // Keep a completed request even if the user leaves; never launch subsequent requests.
          commit(id, result)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'AI 판독 실패'
          try {
            const current = store.read(),
              image = current.images.find((i) => i.id === id)
            if (image) {
              image.analysis = {
                status: 'failed',
                provider: AI_PROVIDER,
                model: AI_MODEL,
                at: new Date().toISOString(),
                message: message.slice(0, 500),
                reservedUsd: null,
              }
              store.write(current)
              if (active.current) onData(current)
            }
          } catch {
            /* Existing data retained; the UI keeps successful unsaved results for a local retry. */
          }
          if (active.current) setError(message)
          if (
            e instanceof AIClientError &&
            [
              'AUTH',
              'DISABLED',
              'BUDGET',
              'INTERVAL',
              'BLOCKED',
              'PROVIDER_BLOCKED',
              'NETWORK',
              'TIMEOUT',
            ].includes(e.code)
          )
            break
        }
        if (n < ids.length - 1 && active.current) {
          setNotice(`AI 판독 ${n + 1}/${ids.length} 처리 · 호출 간격 10초 대기`)
          await new Promise((resolve) => setTimeout(resolve, 10000))
        }
      }
      if (active.current)
        setNotice(
          '요청 처리 종료 · 이미지별 성공·실패와 추출 글감을 확인하세요. 승인 전에는 업무 글감에 등록되지 않습니다.',
        )
    } finally {
      running.current = false
      if (active.current) {
        setBusy(false)
        onBusy(false)
        void check(false)
      }
    }
  }
  return (
    <section className="panel research-panel" aria-label="AI 캡처 판독">
      <h2>
        {status?.connected ? 'AI 글감 추출 · 사용자 검토 필수' : 'AI 판독 미연결 · 수동 입력 가능'}
      </h2>
      <p>
        원본에서 보이는 제목·키워드·출처만 추출합니다. 날짜·출처가 없거나 글자가 불명확하면 확인이
        필요합니다. AI 추출은 실제 검색량·경쟁 문서 수가 아닙니다.
      </p>
      <button className="button secondary" disabled={checking || busy} onClick={() => void check()}>
        {checking ? 'AI 연결 상태 확인 중…' : 'AI 연결 상태 확인'}
      </button>
      <p>
        {status?.message ??
          '연결 미확인: 서버 인증정보와 비용 승인 전에는 AI 판독을 실행하지 않습니다.'}
      </p>
      <p>
        제공업체·모델: {status?.provider ?? AI_PROVIDER} / {AI_MODEL} · 오늘 호출:{' '}
        {status?.used ?? '확인 불가'} · 남은 호출: {status?.remaining ?? '확인 불가'} · 다음 초기화:{' '}
        {status?.resetsAt ?? '확인 불가'}
      </p>
      <p>
        장당 보수적 예약 비용 ${AI_RESERVE_USD.toFixed(2)} · 선택 {selected.length}장 최대 예약 $
        {(selected.length * AI_RESERVE_USD).toFixed(2)} · 오늘 예약 $
        {status?.reservedUsd?.toFixed(2) ?? '확인 불가'}. 실제 청구액이 아닙니다. 실패·재시도도 호출
        및 예약 한도에 포함됩니다.
      </p>
      <p>
        일 30회/$0.60 · 월 $5 · 요청당 1장 순차 처리 · 자동 재시도 없음. 가격 확인 및 승인 유효기간:
        2026-11-21까지.
      </p>
      <label>
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
        선택 이미지의 개인정보를 확인했고, 승인된 비용 범위에서 OpenAI로 전송하는 데 동의합니다. API
        데이터는 기본 학습에 사용되지 않지만 악용 방지 기록은 통상 최대 30일 보관될 수 있습니다.
      </label>
      <fieldset disabled={busy}>
        <legend>AI 분석할 이미지 선택 (최대 20장)</legend>
        {data.images.map((i) => (
          <label key={i.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={selected.includes(i.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, i.id] : selected.filter((id) => id !== i.id),
                )
              }
            />
            {i.name}
          </label>
        ))}
      </fieldset>
      <button
        className="button primary"
        disabled={!status?.connected || status.blocked || busy || !consent || !selected.length}
        onClick={() => void analyze(selected.filter((id) => data.images.some((i) => i.id === id)))}
      >
        {busy ? 'AI 판독 중…' : status?.connected ? 'AI 글감 추출' : 'AI 글감 추출 (미연결)'}
      </button>
      {busy && <progress aria-label="AI 판독 진행" />}
      {notice && (
        <p role="status" aria-label="AI 처리 상태">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" aria-label="AI 오류">
          {error}
        </p>
      )}
      {data.images
        .filter((i) => i.analysis)
        .map((i) => (
          <div key={i.id}>
            <p>
              {i.name}:{' '}
              {i.analysis!.status === 'success'
                ? '판독 완료 · 검토 필요'
                : i.analysis!.status === 'running'
                  ? '처리 중 또는 중단됨 · 확인 필요'
                  : '판독 실패'}{' '}
              · {i.analysis!.message} · {i.analysis!.at}
            </p>
            {i.analysis!.status === 'failed' && (
              <button
                className="button secondary"
                disabled={busy || !status?.connected || !consent || status.blocked}
                onClick={() => void analyze([i.id], true)}
              >
                {pending.current.has(i.id) ? '판독 결과 저장 재시도' : '실패 이미지 다시 판독'}:{' '}
                {i.name}
              </button>
            )}
          </div>
        ))}
    </section>
  )
}
