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
  ...['NAVER_SEARCHAD_API_KEY', 'NAVER_SEARCHAD_SECRET_KEY', 'NAVER_SEARCHAD_CUSTOMER_ID']
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
const repository = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    encoding: 'utf8',
  },
)
assert.equal(repository.status, 0, 'Repository secret scan must enumerate files')
for (const path of new Set(repository.stdout.split('\0').filter(Boolean))) {
  assert.ok(
    !/(^|\/)\.env(?:\.|$)/.test(path) || path === '.env.example',
    'A private environment file is eligible for Git',
  )
  assert.ok(
    !/(^|\/)\.dev\.vars(?:\.|$)/.test(path),
    'A private environment file is eligible for Git',
  )
  if (!existsSync(path)) continue
  const contents = readFileSync(path)
  for (const value of protectedValues)
    // The canary is intentionally defined in this scanner, but must never be in client output.
    if (value !== marker)
      assert.ok(
        !contents.includes(Buffer.from(value)),
        'Local credential found in a Git-eligible file',
      )
}
const rejected = build({ VITE_NAVER_API_KEY: marker })
assert.notEqual(rejected.status, 0, 'VITE credential exposure must be rejected')
assert.ok(
  rejected.stderr.includes('Client environment variables are disabled'),
  'Expected credential boundary rejection',
)
console.log(
  'PASS: local SearchAd credentials absent from Git-eligible files and browser artifacts; canary excluded; VITE_ credential build rejected.',
)
