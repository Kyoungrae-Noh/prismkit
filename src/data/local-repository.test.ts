import { describe, expect, it } from 'vitest'
import { createLocalRepository, STORAGE_KEY } from './local-repository'
import type { IdeaInput } from '../domain/models'

const input: IdeaInput = {
  title: '  새 콘텐츠 기획  ',
  keyword: '  콘텐츠 전략 ',
  category: '비즈니스',
  status: 'inbox',
  memo: '참고 메모',
}
describe('local workspace data', () => {
  it('persists a created idea, updates its status and deletes it across repository instances', async () => {
    const repo = createLocalRepository(localStorage)
    const before = await repo.listIdeas()
    const created = await repo.createIdea(input)
    expect(created.title).toBe('새 콘텐츠 기획')
    expect(created.keyword).toBe('콘텐츠 전략')
    const reopened = createLocalRepository(localStorage)
    expect(await reopened.listIdeas()).toHaveLength(before.length + 1)
    await reopened.updateIdea(created.id, { ...input, status: 'drafting' })
    expect((await repo.listIdeas()).find((idea) => idea.id === created.id)?.status).toBe('drafting')
    await repo.deleteIdea(created.id)
    expect(await reopened.listIdeas()).toHaveLength(before.length)
  })
  it('does not resurrect fixtures after all ideas are removed', async () => {
    const repo = createLocalRepository(localStorage)
    for (const idea of await repo.listIdeas()) await repo.deleteIdea(idea.id)
    expect(await createLocalRepository(localStorage).listIdeas()).toEqual([])
  })
  it.each(['not json', '{"version":2,"ideas":[]}', '{"version":1,"ideas":[{"title":"broken"}]}'])(
    'preserves malformed or unsupported data: %s',
    async (raw) => {
      localStorage.setItem(STORAGE_KEY, raw)
      const repo = createLocalRepository(localStorage)
      await expect(repo.listIdeas()).rejects.toThrow('원본 데이터는 보존')
      await expect(repo.createIdea(input)).rejects.toThrow()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
    },
  )
  it('rejects invalid input without changing stored data', async () => {
    const repo = createLocalRepository(localStorage)
    await expect(repo.createIdea({ ...input, title: '   ' })).rejects.toThrow('제목')
    await expect(repo.createIdea({ ...input, memo: 'x'.repeat(2001) })).rejects.toThrow('메모')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
  it('reports failed writes and preserves the existing list', async () => {
    const repo = createLocalRepository({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })
    const before = await repo.listIdeas()
    await expect(repo.createIdea(input)).rejects.toThrow('저장할 수 없습니다')
    expect(await repo.listIdeas()).toEqual(before)
  })
  it('does not overwrite a stale or missing record', async () => {
    const repo = createLocalRepository(localStorage)
    await expect(repo.updateIdea('missing-id', input)).rejects.toThrow('찾을 수 없습니다')
    await expect(repo.deleteIdea('missing-id')).rejects.toThrow('이미 삭제')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
