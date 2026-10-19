import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose'
import { verifyAccess } from './access.ts'
import { handleProtected } from './security.ts'
const pair = await generateKeyPair('RS256'),
  jwk = await exportJWK(pair.publicKey)
const key = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test' }] })
const settings = {
  ACCESS_ISSUER: 'https://unit-test.cloudflareaccess.com',
  ACCESS_AUD: 'test-audience',
  ADMIN_EMAIL: 'admin@example.invalid',
}
async function jwt(claims: Record<string, unknown> = {}) {
  return new SignJWT({ type: 'app', email: settings.ADMIN_EMAIL, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(settings.ACCESS_ISSUER)
    .setAudience(settings.ACCESS_AUD)
    .setSubject('unit-test')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(pair.privateKey)
}
const req = (
  token?: string,
  url = 'https://prismkit.online/api/searchad/keyword?keyword=test',
  headers: Record<string, string> = {},
) =>
  new Request(url, {
    headers: {
      ...(token ? { 'cf-access-jwt-assertion': token } : {}),
      'x-prismkit-request': 'keyword-query',
      ...headers,
    },
  })
test('validates RS256 signature and expected issuer audience expiry email', async () => {
  await verifyAccess(req(await jwt()), settings, key)
})
test('rejects missing token and unconfigured deployment', async () => {
  await assert.rejects(verifyAccess(req(), settings, key))
  await assert.rejects(verifyAccess(req(await jwt()), {}, key))
})
test('rejects wrong issuer and application audience', async () => {
  const token = await jwt()
  for (const patch of [
    { ACCESS_AUD: 'different' },
    { ACCESS_ISSUER: 'https://different.cloudflareaccess.com' },
  ])
    await assert.rejects(verifyAccess(req(token), { ...settings, ...patch }, key))
})
test('rejects expired, altered, unsigned and another key tokens', async () => {
  const expired = await new SignJWT({ type: 'app', email: settings.ADMIN_EMAIL })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(settings.ACCESS_ISSUER)
    .setAudience(settings.ACCESS_AUD)
    .setSubject('test')
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(pair.privateKey)
  const token = await jwt(),
    parts = token.split('.')
  parts[1] = Buffer.from('{"email":"attacker@example.invalid"}').toString('base64url')
  for (const value of [expired, parts.join('.'), 'eyJhbGciOiJub25lIn0.e30.'])
    await assert.rejects(verifyAccess(req(value), settings, key))
  const other = await generateKeyPair('RS256')
  await assert.rejects(
    verifyAccess(
      req(token),
      settings,
      createLocalJWKSet({ keys: [{ ...(await exportJWK(other.publicKey)), kid: 'test' }] }),
    ),
  )
})
test('rejects different email and service tokens', async () => {
  for (const claims of [{ email: 'other@example.invalid' }, { type: 'service-token' }])
    await assert.rejects(verifyAccess(req(await jwt(claims)), settings, key))
})
test('JWKS unavailability fails closed', async () => {
  await assert.rejects(
    verifyAccess(req(await jwt()), settings, async () => {
      throw Error('unavailable')
    }),
  )
})
test('blocks pages.dev and preview hosts even with a valid assertion', async () => {
  let calls = 0
  for (const host of [
    'prismkit-git.pages.dev',
    'abc.prismkit-git.pages.dev',
    'main.prismkit-git.pages.dev',
  ]) {
    const r = await handleProtected(
      req('token', 'https://' + host + '/'),
      settings,
      async () => {
        calls++
        return new Response('app')
      },
      async () => {
        throw Error()
      },
      async () => {},
    )
    assert.equal(r.status, 403)
  }
  assert.equal(calls, 0)
})
test('blocks unauthenticated admin assets and API without calling downstream', async () => {
  let calls = 0
  for (const path of ['/', '/keywords', '/publishing', '/assets/app.js', '/api/searchad/keyword']) {
    const r = await handleProtected(
      req(undefined, 'https://prismkit.online' + path),
      settings,
      async () => {
        calls++
        return new Response()
      },
      async () => {
        calls++
        throw Error()
      },
    )
    assert.equal(r.status, 401)
  }
  assert.equal(calls, 0)
})
test('rejects dotenv paths and cross-origin API calls', async () => {
  const next = async () => new Response(),
    query = async () => {
      throw Error('must not reach')
    },
    verify = async () => {}
  assert.equal(
    (
      await handleProtected(
        req('test', 'https://prismkit.online/.env'),
        settings,
        next,
        query,
        verify,
      )
    ).status,
    404,
  )
  assert.equal(
    (
      await handleProtected(
        req('test', undefined, { origin: 'https://evil.invalid' }),
        settings,
        next,
        query,
        verify,
      )
    ).status,
    403,
  )
})
test('authorized SPA routes receive no-store and security headers', async () => {
  for (const path of ['/', '/keywords', '/publishing']) {
    const r = await handleProtected(
      req(await jwt(), 'https://prismkit.online' + path),
      settings,
      async () => new Response('<html>app</html>'),
      async () => {
        throw Error()
      },
      (r, s) => verifyAccess(r, s, key),
    )
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  }
})
