import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const outDir = resolve('test-results/security-dist')
const marker = 'PRISMKIT_TEST_ONLY_SECRET_CANARY_9bd82'
const local = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}
const protectedValues = [
  marker,
  ...['NAVER_SEARCHAD_API_KEY', 'NAVER_SEARCHAD_SECRET_KEY']
    .map((name) => process.env[name] || local[name])
    .filter(Boolean),
]
const env = {
  ...process.env,
  NAVER_SEARCHAD_SECRET_KEY: marker,
  NAVER_API_HUB_CLIENT_SECRET: marker,
}
const build = (extra = {}) =>
  spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir], {
    env: { ...env, ...extra },
    encoding: 'utf8',
  })
const result = build()
assert.equal(result.status, 0, 'Canary build must succeed')
function inspect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) inspect(path)
    else
      for (const value of protectedValues)
        assert.ok(
          !readFileSync(path).includes(Buffer.from(value)),
          'Server credential reached a client artifact',
        )
  }
}
inspect(outDir)
if (existsSync('dist')) inspect('dist')
const rejected = build({ VITE_NAVER_API_KEY: marker })
assert.notEqual(rejected.status, 0, 'VITE credential exposure must be rejected')
assert.ok(
  rejected.stderr.includes('Client environment variables are disabled'),
  'Expected credential boundary rejection',
)
console.log(
  'PASS: server credential canaries and local SearchAd keys absent from browser artifacts; VITE_ credential build rejected.',
)
