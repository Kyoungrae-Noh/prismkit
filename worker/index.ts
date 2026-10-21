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
export class SearchAdBudget extends DurableObject<Env & AISettings & DraftSettings> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS cache (keyword TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
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
