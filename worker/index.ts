import { DurableObject } from 'cloudflare:workers'
import {
  querySearchAd,
  emptyBudget,
  type Budget,
  type BudgetStore,
  type CacheEntry,
} from '../edge/searchad.ts'
import { currentBudget, budgetUsage } from '../server/searchad/budget.ts'
import { ApiError } from '../server/searchad/service.ts'
import { failure, securityHeaders } from '../edge/security.ts'
import { aiStatus, extractAI, type AISettings, type AIStore, type AIBudget } from '../edge/ai.ts'
import {
  draftStatus,
  generateDraft,
  type DraftSettings,
  type DraftStore,
  type DraftBudget,
} from '../edge/drafts.ts'
import type { DraftBrief } from '../src/domain/manuscripts.ts'
import {
  queryHub,
  hubStatus,
  type HubStore,
  type HubBudget,
  type HubCache,
  type HubSettings,
} from '../edge/hub.ts'
export class SearchAdBudget extends DurableObject<Env & AISettings & DraftSettings & HubSettings> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS cache (keyword TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
  }
  private hubStore(): HubStore {
    const sql = this.ctx.storage.sql
    sql.exec('CREATE TABLE IF NOT EXISTS hub_budget (api TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    sql.exec(
      'CREATE TABLE IF NOT EXISTS hub_cache (api TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
    sql.exec('DELETE FROM hub_cache WHERE expires<=?', Date.now())
    return {
      read: (api) => {
        const row = sql
          .exec<{ payload: string }>('SELECT payload FROM hub_budget WHERE api=?', api)
          .toArray()[0]
        return row ? (JSON.parse(row.payload) as HubBudget) : null
      },
      write: (api, b) => {
        sql.exec(
          'INSERT INTO hub_budget(api,payload) VALUES(?,?) ON CONFLICT(api) DO UPDATE SET payload=excluded.payload',
          api,
          JSON.stringify(b),
        )
      },
      cached: (api) => {
        const row = sql
          .exec<{ payload: string }>('SELECT payload FROM hub_cache WHERE api=?', api)
          .toArray()[0]
        return row ? (JSON.parse(row.payload) as HubCache) : null
      },
      cache: (api, value) => {
        if (value)
          sql.exec(
            'INSERT INTO hub_cache(api,payload,expires) VALUES(?,?,?) ON CONFLICT(api) DO UPDATE SET payload=excluded.payload,expires=excluded.expires',
            api,
            JSON.stringify(value),
            value.expires,
          )
        else sql.exec('DELETE FROM hub_cache WHERE api=?', api)
      },
    }
  }
  async alarm() {
    // Only the HUB coordination object schedules this alarm. No other data is touched.
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM hub_cache WHERE expires<=?', Date.now())
    const row = sql
      .exec<{ expires: number }>('SELECT MIN(expires) AS expires FROM hub_cache')
      .toArray()[0]
    if (row?.expires) await this.ctx.storage.setAlarm(row.expires)
  }
  async hubUsage(): Promise<Response> {
    try {
      return Response.json(hubStatus(this.env, this.hubStore()), { headers: securityHeaders })
    } catch {
      return failure(503, 'STATE', 'HUB 호출 상태를 읽지 못했습니다.')
    }
  }
  async hubQuery(input: unknown): Promise<Response> {
    try {
      // Schedule cleanup before any external request; even a later crash cannot retain cached data indefinitely.
      const store = this.hubStore()
      const currentAlarm = await this.ctx.storage.getAlarm()
      if (currentAlarm === null) await this.ctx.storage.setAlarm(Date.now() + 300000)
      return Response.json(await queryHub(input, this.env, store), { headers: securityHeaders })
    } catch (e) {
      return e instanceof ApiError
        ? failure(e.status, e.code, e.message)
        : failure(503, 'STATE', 'HUB 요청 처리 오류')
    }
  }
  private draftStore(): DraftStore {
    const sql = this.ctx.storage.sql
    sql.exec(
      'CREATE TABLE IF NOT EXISTS draft_budget (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)',
    )
    return {
      read: () => {
        const row = sql
          .exec<{ payload: string }>('SELECT payload FROM draft_budget WHERE id=1')
          .toArray()[0]
        return row ? (JSON.parse(row.payload) as DraftBudget) : null
      },
      write: (v) => {
        sql.exec(
          'INSERT INTO draft_budget(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
          JSON.stringify(v),
        )
      },
    }
  }
  async draftUsage(): Promise<Response> {
    try {
      return Response.json(draftStatus(this.env, this.draftStore()), { headers: securityHeaders })
    } catch {
      return failure(503, 'STATE', '원고 예산을 확인할 수 없습니다.')
    }
  }
  async draftGenerate(brief: DraftBrief, id: string): Promise<Response> {
    try {
      return Response.json(await generateDraft(brief, id, this.env, this.draftStore()), {
        headers: securityHeaders,
      })
    } catch (e) {
      return e instanceof ApiError
        ? failure(e.status, e.code, e.message)
        : failure(503, 'STATE', '원고 서버 저장 오류')
    }
  }
  private aiStore(): AIStore {
    const sql = this.ctx.storage.sql
    sql.exec(
      'CREATE TABLE IF NOT EXISTS ai_budget (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)',
    )
    return {
      read: () => {
        const row = sql
          .exec<{ payload: string }>('SELECT payload FROM ai_budget WHERE id=1')
          .toArray()[0]
        return row ? (JSON.parse(row.payload) as AIBudget) : null
      },
      write: (value) => {
        sql.exec(
          'INSERT INTO ai_budget(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
          JSON.stringify(value),
        )
      },
    }
  }
  async aiUsage(): Promise<Response> {
    return Response.json(aiStatus(this.env, this.aiStore()), { headers: securityHeaders })
  }
  async aiExtract(blob: Blob, id: string, retry: boolean): Promise<Response> {
    try {
      return Response.json(await extractAI(blob, id, retry, this.env, this.aiStore()), {
        headers: securityHeaders,
      })
    } catch (e) {
      return e instanceof ApiError
        ? failure(e.status, e.code, e.message)
        : failure(503, 'UNAVAILABLE', 'AI 서버 저장 오류입니다.')
    }
  }
  private store(): BudgetStore {
    const sql = this.ctx.storage.sql
    return {
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
  }
  async usage(): Promise<Response> {
    try {
      const store = this.store(),
        time = Date.now()
      const state = currentBudget(store.read(), time)
      store.write(state)
      return Response.json(budgetUsage(state, time), { headers: securityHeaders })
    } catch {
      return failure(503, 'UNAVAILABLE', '호출 예산을 확인할 수 없습니다.')
    }
  }
  async query(keyword: unknown): Promise<Response> {
    try {
      return Response.json(
        await querySearchAd(
          keyword,
          {
            key: this.env.NAVER_SEARCHAD_API_KEY,
            secret: this.env.NAVER_SEARCHAD_SECRET_KEY,
            customer: this.env.NAVER_SEARCHAD_CUSTOMER_ID,
          },
          this.store(),
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
