import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  querySearchAd,
  emptyBudget,
  boundedJson,
  type Budget,
  type BudgetStore,
  type CacheEntry,
} from './searchad.ts'
const credentials = { key: 'TEST_KEY', secret: 'TEST_SECRET', customer: 'TEST_CUSTOMER' }
function store(): BudgetStore {
  let value = emptyBudget()
  const cache = new Map<string, CacheEntry>()
  return {
    read: () => structuredClone(value),
    write: (v: Budget) => {
      value = structuredClone(v)
    },
    cached: (k) => cache.get(k),
    cache: (k, v) => {
      cache.set(k, v)
    },
  }
}
const payload = {
  keywordList: [
    { relKeyword: '테스트', monthlyPcQcCnt: 100, monthlyMobileQcCnt: 200 },
    { relKeyword: '테스트관련', monthlyPcQcCnt: '<10', monthlyMobileQcCnt: 3 },
  ],
}
const success = async () => Response.json(payload)
test('normalizes real-shaped counts, bounded values and related keywords', async () => {
  const data = await querySearchAd('테스트', credentials, store(), success)
  assert.equal(data.rows[0].total, 300)
  assert.equal(data.rows[1].pc, '<10')
  assert.equal(data.rows[1].total, null)
  assert.equal(data.expansion.data?.keywords[0], '테스트관련')
})
test('cache and 10-second interval survive separate service calls', async () => {
  const s = store()
  let calls = 0,
    now = 100000
  const fetcher = async () => {
    calls++
    return success()
  }
  await querySearchAd('테스트', credentials, s, fetcher, () => now)
  assert.equal((await querySearchAd('테스트', credentials, s, fetcher, () => now)).cached, true)
  await assert.rejects(querySearchAd('다른키워드', credentials, s, fetcher, () => now))
  now += 10000
  await querySearchAd('다른키워드', credentials, s, fetcher, () => now)
  assert.equal(calls, 2)
})
test('cache expires at five minutes', async () => {
  const s = store()
  let now = 100000
  await querySearchAd('테스트', credentials, s, success, () => now)
  now += 300000
  assert.equal((await querySearchAd('테스트', credentials, s, success, () => now)).cached, false)
  assert.equal(s.read().calls, 2)
})
test('durable lifetime budget cannot reset through a new invocation', async () => {
  const s = store()
  let now = 100000
  for (let i = 0; i < 10; i++) {
    await querySearchAd('키워드' + i, credentials, s, success, () => now)
    now += 11000
  }
  await assert.rejects(
    querySearchAd('11번째', credentials, s, success, () => now),
    /총 10회/,
  )
  assert.equal(s.read().calls, 10)
})
test('concurrent in-flight requests do not create another reservation', async () => {
  const s = store()
  let release: () => void = () => {}
  const pending = querySearchAd(
    '하나',
    credentials,
    s,
    async () => {
      await new Promise<void>((r) => {
        release = r
      })
      return success()
    },
    () => 100000,
  )
  await assert.rejects(querySearchAd('둘', credentials, s, success, () => 100000))
  release()
  await pending
  assert.equal(s.read().calls, 1)
})
for (const status of [401, 403, 429])
  test(`HTTP ${status} persistently opens the circuit without retry`, async () => {
    const s = store()
    let calls = 0
    await assert.rejects(
      querySearchAd(
        '테스트',
        credentials,
        s,
        async () => {
          calls++
          return new Response('sensitive upstream body', { status })
        },
        () => 100000,
      ),
    )
    await assert.rejects(querySearchAd('테스트', credentials, s, success, () => 999999))
    assert.equal(s.read().blocked, true)
    assert.equal(calls, 1)
  })
test('network errors never echo headers or secrets', async () => {
  await assert.rejects(
    querySearchAd('테스트', credentials, store(), async () => {
      throw Error('TEST_SECRET')
    }),
    (error) => error instanceof Error && !error.message.includes('TEST_SECRET'),
  )
})
test('missing credentials consume no reservation', async () => {
  const s = store()
  await assert.rejects(querySearchAd('테스트', { ...credentials, secret: '' }, s, success))
  assert.equal(s.read().calls, 0)
})
test('oversize and malformed response bodies fail safely', async () => {
  await assert.rejects(boundedJson(new Response('x'.repeat(20)), 10))
  await assert.rejects(boundedJson(new Response('not json')))
})
test('only fixed GET endpoint is contacted and signature stays server-side', async () => {
  await querySearchAd('테스트', credentials, store(), async (url, init) => {
    assert.equal(new URL(String(url)).origin, 'https://api.searchad.naver.com')
    assert.equal(init?.method, 'GET')
    assert.equal(init?.redirect, 'manual')
    assert.ok(new Headers(init?.headers).get('X-Signature'))
    return success()
  })
})
test('redirect responses are rejected without forwarding credentials', async () => {
  let calls = 0
  await assert.rejects(
    querySearchAd('테스트', credentials, store(), async () => {
      calls++
      return new Response(null, {
        status: 302,
        headers: { location: 'https://untrusted.invalid/' },
      })
    }),
  )
  assert.equal(calls, 1)
})
