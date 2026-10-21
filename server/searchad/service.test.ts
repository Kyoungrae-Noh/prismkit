import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createService, credentials, keywordInput, normalize, sign } from './service.ts'
import { createHandler } from './http.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
const auth = () => ({ key: 'test-key', secret: 'test-secret', customer: 'test-customer' })
const raw = {
  keywordList: [
    { relKeyword: '온누리상품권', monthlyPcQcCnt: 10, monthlyMobileQcCnt: 20 },
    { relKeyword: '관련', monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: '100' },
  ],
}
const ok = () => new Response(JSON.stringify(raw), { status: 200 })
test('signature matches an independently precomputed HMAC fixture', () => {
  assert.equal(sign('1700000000000', 'test-secret'), 'pLnZJtUUxfdXitHXWo/EvKzookF5hlb/Rs2Fuw1W4js=')
})
test('normalizes actual counts and bounds without inferring exact totals', () => {
  const data = normalize(raw, '온누리상품권', '2026-10-19T00:00:00Z')
  assert.equal(data.volume.data?.total, 30)
  assert.equal(data.rows[1].pc, '<10')
  assert.equal(data.rows[1].total, null)
  assert.deepEqual(data.expansion.data?.keywords, ['관련'])
  assert.equal(data.volume.verification, 'VERIFIED')
})
test('missing exact keyword never substitutes first result', () => {
  const data = normalize(raw, '없음', '2026-10-19T00:00:00Z')
  assert.equal(data.volume.data, null)
  assert.ok(data.volume.missing.includes('keyword'))
})
test('zero and missing values are distinct', () => {
  const data = normalize(
    { keywordList: [{ relKeyword: 'a', monthlyPcQcCnt: 0 }] },
    'a',
    '2026-10-19T00:00:00Z',
  )
  assert.equal(data.volume.data?.pc, 0)
  assert.equal(data.volume.data?.mobile, null)
})
test('malformed responses are rejected', () => {
  for (const value of [
    {},
    null,
    { keywordList: [{ relKeyword: 'a', monthlyPcQcCnt: -1 }] },
    { keywordList: [{ relKeyword: 'a', monthlyPcQcCnt: 'unknown' }] },
  ])
    assert.throws(() => normalize(value, 'a', '2026-10-19T00:00:00Z'))
})
test('requires all server credentials without echoing values', () => {
  assert.throws(
    () => credentials({ NAVER_SEARCHAD_API_KEY: 'sensitive-value' }),
    (error) => error instanceof Error && !error.message.includes('sensitive-value'),
  )
})
test('validates a single keyword before any request', () => {
  for (const value of ['', ',a', 'a\nb', 'a'.repeat(61), null])
    assert.throws(() => keywordInput(value))
  assert.equal(keywordInput(' 온누리 상품권 '), '온누리상품권')
})
test('uses fixed GET endpoint and signed server-only headers', async () => {
  const query = createService(auth, {
    now: () => 1700000000000,
    fetcher: async (url, init) => {
      assert.equal(new URL(String(url)).pathname, '/keywordstool')
      assert.equal(init?.method, 'GET')
      assert.equal(init?.redirect, 'error')
      assert.equal((init?.headers as Record<string, string>)['X-API-KEY'], 'test-key')
      assert.equal(
        (init?.headers as Record<string, string>)['X-Signature'],
        sign('1700000000000', 'test-secret'),
      )
      return ok()
    },
  })
  const result = await query('온누리상품권')
  assert.ok(!JSON.stringify(result).includes('test-secret'))
  assert.ok(!JSON.stringify(result).includes('test-key'))
})
test('cache avoids duplicate calls and expires after five minutes', async () => {
  let time = 0,
    calls = 0
  const query = createService(auth, {
    now: () => time,
    fetcher: async () => {
      calls++
      return ok()
    },
  })
  await query('온누리상품권')
  const cached = await query('온누리 상품권')
  assert.equal(cached.cached, true)
  assert.equal(calls, 1)
  time = 300001
  await query('온누리상품권')
  assert.equal(calls, 2)
})
test('minimum interval and session cap prevent extra calls', async () => {
  let time = 0,
    calls = 0
  const query = createService(auth, {
    now: () => time,
    maxCalls: 2,
    fetcher: async () => {
      calls++
      return ok()
    },
  })
  await query('a')
  await assert.rejects(query('b'))
  time = 10000
  await query('b')
  time = 20000
  await assert.rejects(query('c'))
  assert.equal(calls, 2)
})
test('concurrent queries cannot cause a burst', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  const query = createService(auth, {
    fetcher: async () => {
      calls++
      await gate
      return ok()
    },
  })
  const first = query('a')
  await assert.rejects(query('a'))
  release()
  await first
  assert.equal(calls, 1)
})
test('401 and 403 stop further calls without automatic retry', async () => {
  for (const status of [401, 403]) {
    let calls = 0
    const query = createService(auth, {
      fetcher: async () => {
        calls++
        return new Response('private upstream detail', { status })
      },
    })
    await assert.rejects(
      query('a'),
      (error) => error instanceof Error && !error.message.includes('private'),
    )
    await assert.rejects(query('b'))
    assert.equal(calls, 1)
  }
})
test('429 opens the circuit immediately', async () => {
  let calls = 0
  const query = createService(auth, {
    fetcher: async () => {
      calls++
      return new Response('', { status: 429 })
    },
  })
  await assert.rejects(query('a'))
  await assert.rejects(query('a'))
  assert.equal(calls, 1)
})
test('network and upstream errors are sanitized and never retried', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('test-secret')
    },
    async () => new Response('test-secret', { status: 500 }),
  ]) {
    let calls = 0
    const query = createService(auth, {
      fetcher: async () => {
        calls++
        return fetcher()
      },
    })
    await assert.rejects(
      query('a'),
      (error) => error instanceof Error && !error.message.includes('test-secret'),
    )
    assert.equal(calls, 1)
  }
})
test('invalid JSON cannot become VERIFIED', async () => {
  const query = createService(auth, { fetcher: async () => new Response('not json') })
  await assert.rejects(query('a'))
})
test('HTTP boundary rejects foreign origins, hosts and non-GET requests', async () => {
  let calls = 0
  const handler = createHandler(async () => {
    calls++
    return normalize(raw, '온누리상품권', '2026-10-19T00:00:00Z')
  })
  for (const changes of [
    { headers: { host: 'evil.example' } },
    {
      headers: {
        host: '127.0.0.1:4179',
        'x-prismkit-request': 'keyword-query',
        origin: 'https://evil.example',
      },
    },
    { method: 'POST' },
  ]) {
    let status = 0
    const req = {
      method: 'GET',
      url: '/api/searchad/keyword?keyword=a',
      headers: { host: '127.0.0.1:4179', 'x-prismkit-request': 'keyword-query' },
      ...changes,
    }
    const res = {
      setHeader() {},
      writeHead(value: number) {
        status = value
      },
      end() {},
    }
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
    assert.ok(status === 403 || status === 405)
  }
  assert.equal(calls, 0)
})
test('HTTP boundary returns normalized JSON only for explicit local requests', async () => {
  const handler = createHandler(async () => normalize(raw, '온누리상품권', '2026-10-19T00:00:00Z'))
  let status = 0,
    body = ''
  await handler(
    {
      method: 'GET',
      url: '/api/searchad/keyword?keyword=a',
      headers: {
        host: '127.0.0.1:4179',
        'x-prismkit-request': 'keyword-query',
        origin: 'http://127.0.0.1:5173',
      },
    } as unknown as IncomingMessage,
    {
      setHeader() {},
      writeHead(value: number) {
        status = value
      },
      end(value: string) {
        body = value
      },
    } as unknown as ServerResponse,
  )
  assert.equal(status, 200)
  assert.equal(JSON.parse(body).volume.data.total, 30)
})

test('local daily usage resets at KST midnight without clearing upstream block', async () => {
  let time = Date.parse('2026-10-21T14:59:30Z')
  const query = createService(auth, { now: () => time, fetcher: async () => ok() })
  await query('온누리상품권')
  assert.equal(query.usage().used, 1)
  time += 60000
  assert.equal(query.usage().used, 0)
  assert.equal(query.usage().remaining, 30)
  const blocked = createService(auth, {
    now: () => time,
    fetcher: async () => new Response('', { status: 429 }),
  })
  await assert.rejects(blocked('차단'))
  time += 86400000
  assert.equal(blocked.usage().blocked, true)
  await assert.rejects(blocked('차단'))
})
