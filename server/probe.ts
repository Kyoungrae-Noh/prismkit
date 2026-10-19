import { createService, credentials, ApiError } from './searchad/service.ts'
// Explicit one-shot diagnostic. Never invoked by dev, build or tests.
let status: number | null = null
const query = createService(() => credentials(process.env), {
  maxCalls: 1,
  fetcher: async (...args: Parameters<typeof fetch>) => {
    const response = await fetch(...args)
    status = response.status
    return response
  },
})
try {
  const result = await query('온누리상품권')
  console.log(
    JSON.stringify({
      keyword: '온누리상품권',
      httpStatus: status,
      verification: result.volume.verification,
      collectedAt: result.volume.collectedAt,
      volume: result.volume.data,
      relatedCount: result.expansion.data?.keywords.length,
      rows: result.rows.length,
      boundedRows: result.rows.filter((row) => row.pc === '<10' || row.mobile === '<10').length,
    }),
  )
} catch (error) {
  console.log(
    JSON.stringify({
      httpStatus: status,
      error: error instanceof ApiError ? error.code : 'INTERNAL',
    }),
  )
  process.exitCode = 1
}
