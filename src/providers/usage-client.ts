import type { Usage } from '../../server/searchad/budget'
export async function readBudget(fetcher: typeof fetch = fetch): Promise<Usage> {
  let response: Response
  try {
    response = await fetcher('/api/searchad/usage', {
      headers: { 'X-Prismkit-Request': 'keyword-query' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      'name' in e &&
      (e.name === 'TimeoutError' || e.name === 'AbortError')
    )
      throw new Error('예산 조회 시간 초과입니다. 잠시 후 버튼으로 다시 시도하세요.')
    throw new Error(
      '네트워크 연결 또는 인증 페이지 이동으로 예산 조회에 실패했습니다. 로그인 상태를 확인한 뒤 다시 시도하세요.',
    )
  }
  if (response.status === 401 || response.status === 403)
    throw new Error('관리자 인증이 필요합니다. 페이지를 새로고침하고 로그인 후 다시 시도하세요.')
  if (response.status >= 500)
    throw new Error(
      `예산 서버 오류 (HTTP ${response.status})입니다. 잠시 후 다시 시도하세요. 계속되면 관리자 점검이 필요합니다.`,
    )
  if (!response.ok)
    throw new Error(`예산 조회 실패 (HTTP ${response.status})입니다. 자동 재시도하지 않습니다.`)
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('예산 응답 형식 오류입니다. 로그인 페이지인지 확인하고 다시 시도하세요.')
  let v: Usage
  try {
    v = await response.json()
  } catch {
    throw new Error('예산 JSON 응답 형식 오류입니다. 다시 시도하세요.')
  }
  if (
    !v ||
    !Number.isSafeInteger(v.used) ||
    v.used < 0 ||
    !Number.isSafeInteger(v.remaining) ||
    v.remaining < 0 ||
    !Number.isSafeInteger(v.limit) ||
    v.limit < 1 ||
    v.limit > 30 ||
    v.remaining !== Math.max(0, v.limit - v.used) ||
    typeof v.blocked !== 'boolean' ||
    typeof v.migration !== 'boolean' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.day) ||
    !Number.isFinite(Date.parse(v.resetsAt)) ||
    !(v.lastQueryAt === null || Number.isFinite(Date.parse(v.lastQueryAt)))
  )
    throw new Error('예산 응답 형식 오류입니다. 서버의 수치·날짜를 확인해야 합니다.')
  if (Date.parse(v.resetsAt) <= Date.now())
    throw new Error('예산 응답의 초기화 시각이 지났습니다. 기기 시각을 확인하고 다시 조회하세요.')
  return v
}
