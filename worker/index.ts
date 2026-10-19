import { DurableObject } from 'cloudflare:workers'
import {
  querySearchAd,
  emptyBudget,
  type Budget,
  type BudgetStore,
  type CacheEntry,
} from '../edge/searchad.ts'
import { ApiError } from '../server/searchad/service.ts'
import { failure, securityHeaders } from '../edge/security.ts'
export class SearchAdBudget extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS cache (keyword TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
  }
  async query(keyword: unknown): Promise<Response> {
    const sql = this.ctx.storage.sql
    const store: BudgetStore = {
      read: () => {
        const row = sql
          .exec<{ payload: string }>('SELECT payload FROM budget WHERE id=1')
          .toArray()[0]
        return row ? (JSON.parse(row.payload) as Budget) : emptyBudget()
      },
      write: (value) => {
        sql.exec(
          'INSERT INTO budget (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
          JSON.stringify(value),
        )
      },
      cached: (key) => {
        const row = sql
          .exec<{ payload: string; expires: number }>(
            'SELECT payload, expires FROM cache WHERE keyword=?',
            key,
          )
          .toArray()[0]
        return row
          ? ({ expires: row.expires, data: JSON.parse(row.payload) } as CacheEntry)
          : undefined
      },
      cache: (key, value) => {
        this.ctx.storage.transactionSync(() => {
          sql.exec('DELETE FROM cache WHERE expires<=?', Date.now())
          sql.exec(
            'INSERT INTO cache(keyword,payload,expires) VALUES (?,?,?) ON CONFLICT(keyword) DO UPDATE SET payload=excluded.payload,expires=excluded.expires',
            key,
            JSON.stringify(value.data),
            value.expires,
          )
        })
      },
    }
    try {
      return Response.json(
        await querySearchAd(
          keyword,
          {
            key: this.env.NAVER_SEARCHAD_API_KEY,
            secret: this.env.NAVER_SEARCHAD_SECRET_KEY,
            customer: this.env.NAVER_SEARCHAD_CUSTOMER_ID,
          },
          store,
        ),
        { headers: securityHeaders },
      )
    } catch (error) {
      return error instanceof ApiError
        ? failure(error.status, error.code, error.message)
        : failure(503, 'UNAVAILABLE', '운영 API를 처리할 수 없습니다.')
    }
  }
}
export default {
  fetch() {
    return failure(403, 'FORBIDDEN', '공개 호출을 허용하지 않습니다.')
  },
} satisfies ExportedHandler<Env>
