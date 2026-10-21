import { requestHub } from './hub-client'
import { createSearchAdProvider } from './searchad-client'
import type { HubRequest, HubResult } from './hub-types'
import type { SearchAdResponse } from './searchad-types'
/** Browser-only, bounded transient cache. Failures are never cached/retried. */
export function cachedQuery<I, O extends { cached: boolean }>(
  request: (input: I) => Promise<O>,
  keyOf: (input: I) => string,
  now = Date.now,
) {
  const cache = new Map<string, { expires: number; value: O }>(),
    pending = new Map<string, Promise<O>>()
  const peek = (input: I) => {
    const hit = cache.get(keyOf(input))
    return hit && hit.expires > now() ? { ...structuredClone(hit.value), cached: true } : undefined
  }
  const prime = (input: I, value: O) => {
    for (const [k, v] of cache) if (v.expires <= now()) cache.delete(k)
    if (cache.size >= 30) cache.delete(cache.keys().next().value!)
    cache.set(keyOf(input), { expires: now() + 300000, value: structuredClone(value) })
  }
  const query = async (input: I): Promise<O> => {
    const key = keyOf(input),
      hit = cache.get(key)
    if (hit && hit.expires > now()) return { ...structuredClone(hit.value), cached: true }
    if (pending.has(key)) return structuredClone(await pending.get(key)!)
    const task = request(input)
      .then((value) => {
        prime(input, value)
        return value
      })
      .finally(() => pending.delete(key))
    pending.set(key, task)
    return structuredClone(await task)
  }
  return Object.assign(query, { peek, prime })
}
export const analysisHub = cachedQuery<HubRequest, HubResult>(requestHub, (r) =>
  JSON.stringify([
    r.api,
    r.query.trim(),
    r.startDate,
    r.endDate,
    r.device ?? 'all',
    r.category,
    r.shoppingScope ?? 'keyword',
    r.sort ?? 'sim',
    r.groups,
    r.display ?? 10,
  ]),
)
export const analysisVolume = cachedQuery<string, SearchAdResponse>(
  (keyword) => createSearchAdProvider().query(keyword),
  (s) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase(),
)
