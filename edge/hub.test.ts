import test from 'node:test'
import assert from 'node:assert/strict'
import { hubApis, type HubApi, type HubRequest } from '../src/providers/hub-types.ts'
import { hubPaths, hubWireRequest, normalizeHub, validateHubRequest } from './hub-contract.ts'
import {
  queryHub,
  hubStatus,
  hubPolicy,
  hubLimits,
  type HubBudget,
  type HubCache,
  type HubStore,
} from './hub.ts'
import { hubRoute } from './hub-route.ts'
import { handleProtected } from './security.ts'
const time = Date.parse('2026-10-21T12:00:00Z')
const request = (api: HubApi): HubRequest => ({
  api,
  query: '여행 예약',
  startDate: '2026-10-01',
  endDate: '2026-10-14',
  category: '50000000',
})
function raw(api: HubApi) {
  return api === 'trend' || api === 'shopping'
    ? {
        startDate: '2026-10-01',
        endDate: '2026-10-14',
        timeUnit: 'date',
        results: [
          {
            title: '여행 예약',
            data: [
              { period: '2026-10-01', ratio: 0 },
              { period: '2026-10-14', ratio: 100 },
            ],
          },
        ],
      }
    : {
        total: 0,
        start: 1,
        display: 1,
        items: [
          {
            title: '<b>여행</b> 예약',
            description: '조회 자료',
            link: 'https://example.com/post',
            ...(api === 'blog'
              ? { postdate: '20261001' }
              : api === 'news'
                ? {
                    pubDate: 'Thu, 01 Oct 2026 12:00:00 +0900',
                    originallink: 'https://example.com/original',
                  }
                : {}),
          },
        ],
      }
}
function store(): HubStore {
  const budgets = new Map<HubApi, HubBudget>(),
    cache = new Map<HubApi, HubCache>()
  return {
    read: (a) => structuredClone(budgets.get(a) ?? null),
    write: (a, b) => {
      budgets.set(a, structuredClone(b))
    },
    cached: (a) => structuredClone(cache.get(a) ?? null),
    cache: (a, b) => {
      if (b) cache.set(a, structuredClone(b))
      else cache.delete(a)
    },
  }
}
const auth = { NAVER_API_HUB_CLIENT_ID: 'test-id', NAVER_API_HUB_CLIENT_SECRET: 'test-secret' }
const allowed = Object.fromEntries(
  hubApis.map((a) => [a, { enabled: true, reason: 'mock test only' }]),
) as typeof hubPolicy
for (const api of hubApis)
  test(`${api}: official endpoint, auth and normalization`, async () => {
    const input = request(api),
      s = store()
    let calls = 0
    const result = await queryHub(
      input,
      auth,
      s,
      async (url, init) => {
        calls++
        assert.equal(new URL(String(url)).origin, 'https://naverapihub.apigw.ntruss.com')
        assert.equal(new URL(String(url)).pathname, hubPaths[api])
        const headers = new Headers(init?.headers)
        assert.equal(headers.get('X-NCP-APIGW-API-KEY'), 'test-secret')
        assert.equal(String(url).includes('test-secret'), false)
        assert.equal(init?.redirect, 'manual')
        return Response.json(raw(api))
      },
      () => time,
      allowed,
    )
    assert.equal(calls, 1)
    assert.equal(result.api, api)
    assert.equal(s.read(api)?.daily, 1)
    if (api === 'trend' || api === 'shopping') {
      assert.equal(result.total, null)
      assert.match(result.unit, /^relative-/)
      assert.equal(result.series[0].points[0].ratio, 0)
    } else {
      assert.equal(result.total, 0)
      assert.equal(result.items[0].apiPosition, 1)
      assert.equal(result.scope, 'api-results-only')
      if (api === 'kin' || api === 'cafe') assert.equal(result.items[0].date, null)
    }
  })
test('held APIs reject before credentials or calls; activated APIs require server credentials', async () => {
  const s = store()
  let calls = 0
  for (const api of hubApis) {
    await assert.rejects(
      queryHub(
        request(api),
        auth,
        s,
        async () => {
          calls++
          throw Error()
        },
        () => time,
        Object.fromEntries(
          hubApis.map((a) => [a, { enabled: false, reason: '조건 확인 필요' }]),
        ) as typeof hubPolicy,
      ),
      /조건/,
    )
    await assert.rejects(
      queryHub(
        request(api),
        {},
        s,
        async () => {
          calls++
          throw Error()
        },
        () => time,
      ),
      /인증정보 미등록/,
    )
    assert.equal(s.read(api), null)
  }
  assert.equal(calls, 0)
  assert.equal(
    hubStatus(auth, s, time).apis.every((a) => a.enabled),
    true,
  )
})
test('bounded inputs reject invalid dates, URLs as API names, controls and excessive groups', () => {
  for (const patch of [
    { api: 'https://evil.invalid' },
    { query: '' },
    { query: '\nsecret' },
    { startDate: '2026-02-31' },
    { endDate: '2026-10-22' },
    { category: 'bad' },
    { device: 'tablet' },
    { groups: Array(6).fill('x') },
    { extra: 'value' },
  ])
    assert.throws(() => validateHubRequest({ ...request('shopping'), ...patch }, time))
  assert.throws(() => validateHubRequest({ ...request('trend'), startDate: '2020-01-01' }, time))
})
test('shopping category and trend groups use their distinct documented wire schemas', () => {
  const category = hubWireRequest({ ...request('shopping'), shoppingScope: 'category' })
  assert.match(category.url, /\/shopping\/v1\/categories$/)
  assert.deepEqual(JSON.parse(category.body!).category, [
    { name: '여행 예약', param: ['50000000'] },
  ])
  const trend = hubWireRequest({ ...request('trend'), groups: ['여행', '예약'], device: 'mo' })
  assert.equal(JSON.parse(trend.body!).keywordGroups.length, 2)
  assert.equal(JSON.parse(trend.body!).device, 'mo')
})
test('invalid totals, unsafe URLs, out-of-period/duplicate/oversized ratios fail closed', () => {
  assert.throws(() =>
    normalizeHub({ ...raw('blog'), total: -1 }, request('blog'), new Date(time).toISOString()),
  )
  assert.throws(() =>
    normalizeHub(
      { ...raw('blog'), items: [{ title: 'x', description: 'x', link: 'javascript:alert(1)' }] },
      request('blog'),
      new Date(time).toISOString(),
    ),
  )
  for (const data of [
    [{ period: '2026-10-01', ratio: 101 }],
    [{ period: '2026-09-30', ratio: 20 }],
    [
      { period: '2026-10-01', ratio: 20 },
      { period: '2026-10-01', ratio: 30 },
    ],
  ])
    assert.throws(() =>
      normalizeHub(
        { ...raw('trend'), results: [{ title: '여행 예약', data }] },
        request('trend'),
        new Date(time).toISOString(),
      ),
    )
})
test('cache prevents repeated upstream calls and new queries invalidate earlier cache', async () => {
  const s = store()
  let calls = 0,
    now = time
  const fetcher = async () => {
    calls++
    return Response.json(raw('blog'))
  }
  await queryHub(request('blog'), auth, s, fetcher, () => now, allowed)
  assert.equal((await queryHub(request('blog'), auth, s, fetcher, () => now, allowed)).cached, true)
  now += 1001
  await queryHub({ ...request('blog'), query: '새 주제' }, auth, s, fetcher, () => now, allowed)
  now += 1001
  await queryHub(request('blog'), auth, s, fetcher, () => now, allowed)
  assert.equal(calls, 3)
  now += 300001
  await queryHub(request('blog'), auth, s, fetcher, () => now, allowed)
  assert.equal(calls, 4, 'expired cache must not be reused')
})
test('corrupt budget metadata fails closed without upstream calls or reset', async () => {
  const s = store()
  s.write('blog', {
    day: 'broken',
    month: '2026-10',
    daily: 30,
    monthly: 300,
    last: 0,
    busyUntil: 0,
    blocked: null,
  })
  let calls = 0
  await assert.rejects(
    queryHub(
      request('blog'),
      auth,
      s,
      async () => {
        calls++
        return Response.json(raw('blog'))
      },
      () => time,
      allowed,
    ),
    /예산 자료/,
  )
  assert.equal(calls, 0)
  assert.equal(s.read('blog')?.monthly, 300)
})
test('redirect responses fail without following the destination or exposing upstream content', async () => {
  const s = store()
  let calls = 0
  await assert.rejects(
    queryHub(
      request('blog'),
      auth,
      s,
      async (_url, init) => {
        calls++
        assert.equal(init?.redirect, 'manual')
        return new Response('private upstream body', {
          status: 302,
          headers: { Location: 'https://other.invalid/' },
        })
      },
      () => time,
    ),
    /HTTP 302/,
  )
  assert.equal(calls, 1)
  assert.equal(s.cached('blog'), null)
  assert.equal(s.read('blog')?.daily, 1)
})
for (const status of [401, 403, 429])
  test(`${status}: no automatic retries and persistent block isolated to affected API`, async () => {
    const s = store()
    let calls = 0
    const fail = async () => {
      calls++
      return Response.json({ credential: 'never echo raw upstream error' }, { status })
    }
    await assert.rejects(
      queryHub(request('blog'), auth, s, fail, () => time, allowed),
      /NAVER 인증/,
    )
    await assert.rejects(
      queryHub(request('blog'), auth, s, fail, () => time + 10000, allowed),
      /중단/,
    )
    assert.equal(calls, 1)
    assert.equal(s.read('blog')?.daily, 1)
    await queryHub(
      request('cafe'),
      auth,
      s,
      async () => Response.json(raw('cafe')),
      () => time,
      allowed,
    )
  })
test('daily/monthly budget, KST rollover, interval and independent counters', async () => {
  const s = store(),
    fetcher = async () => Response.json(raw('blog'))
  await queryHub(request('blog'), auth, s, fetcher, () => time, allowed)
  await assert.rejects(
    queryHub({ ...request('blog'), query: 'new' }, auth, s, fetcher, () => time + 100, allowed),
    /간격/,
  )
  s.write('blog', { ...s.read('blog')!, daily: hubLimits.daily })
  await assert.rejects(
    queryHub(request('blog'), auth, s, fetcher, () => time + 10001, allowed),
    /한도/,
  )
  s.write('blog', { ...s.read('blog')!, daily: 0, monthly: hubLimits.monthly })
  await assert.rejects(
    queryHub(request('blog'), auth, s, fetcher, () => time + 86400000, allowed),
    /한도/,
  )
  await queryHub(
    request('blog'),
    auth,
    s,
    fetcher,
    () => Date.parse('2026-10-31T15:00:01Z'),
    allowed,
  )
  assert.equal(s.read('blog')?.monthly, 1)
  assert.equal(s.read('trend'), null)
})
test('reservation prevents concurrent duplicate requests and timeouts consume one attempt', async () => {
  const s = store()
  let finish!: (v: Response) => void
  const first = queryHub(
    request('blog'),
    auth,
    s,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    () => time,
    allowed,
  )
  await assert.rejects(
    queryHub(
      request('blog'),
      auth,
      s,
      async () => {
        throw Error('must not run')
      },
      () => time,
      allowed,
    ),
    /진행/,
  )
  finish(Response.json(raw('blog')))
  await first
  await assert.rejects(
    queryHub(
      request('news'),
      auth,
      s,
      async () => {
        throw Error('timeout secret')
      },
      () => time,
      allowed,
    ),
    /시간 초과/,
  )
  assert.equal(s.read('news')?.daily, 1)
  assert.equal(s.read('news')?.busyUntil, 0)
})
test('HUB routes require verified Access, same-origin headers, exact methods and bounded JSON', async () => {
  let calls = 0
  const rpc = () => ({
    hubUsage: async () => {
      calls++
      return Response.json({})
    },
    hubQuery: async () => {
      calls++
      return Response.json({})
    },
  })
  for (const [path, method, headers, expected] of [
    ['/api/hub/status', 'GET', {}, 403],
    ['/api/hub/status', 'POST', { 'x-prismkit-request': 'hub-query' }, 405],
    [
      '/api/hub/query',
      'POST',
      { 'x-prismkit-request': 'hub-query', origin: 'https://evil.invalid' },
      403,
    ],
    ['/api/hub/unknown', 'GET', { 'x-prismkit-request': 'hub-query' }, 404],
  ] as const)
    assert.equal(
      (await hubRoute(new Request('https://prismkit.online' + path, { method, headers }), rpc))
        .status,
      expected,
    )
  const settings = { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ADMIN_EMAIL: '' }
  const req = new Request('https://prismkit.online/api/hub/status', {
    headers: { 'x-prismkit-request': 'hub-query' },
  })
  const response = await handleProtected(
    req,
    settings,
    async () => Response.json({}),
    async () => {
      throw Error()
    },
    async () => {
      throw Error('JWT invalid')
    },
    undefined,
    undefined,
    () => hubRoute(req, rpc),
  )
  assert.equal(response.status, 401)
  assert.equal(calls, 0)
  assert.equal((await hubRoute(req, rpc)).status, 200)
  assert.equal(calls, 1)
})
