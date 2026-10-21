import { createServer } from 'node:http'
import { createService, credentials } from './searchad/service.ts'
import { createHandler } from './searchad/http.ts'
// Node loads .env server-side; never serve this directory or the env file.
const server = createServer(createHandler(createService(() => credentials(process.env))))
server.listen(4179, '127.0.0.1', () =>
  console.log('Prismkit local API: http://127.0.0.1:4179 (30 calls/KST day; no automatic retries)'),
)
server.on('error', () => {
  console.error('Local API could not start. Check port 4179.')
  process.exitCode = 1
})
