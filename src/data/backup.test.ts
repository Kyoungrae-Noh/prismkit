import { it, expect } from 'vitest'
import {
  exportWorkspace,
  parseBackup,
  restoreWorkspace,
  rawSnapshot,
  previousBackup,
  compareBackups,
  referenceIssues,
} from './backup'
import { createLocalRepository, STORAGE_KEY } from './local-repository'
import { createResearchStore } from './research-store'
import { createCandidateStore } from './candidate-store'
import { createPublishingStore } from './publishing-store'
import { analyzeCandidates } from '../domain/candidates'
import { blankCompetition } from '../domain/publishing'
import { RESTORED_KEY, type StoragePort } from './storage'
function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v)
    },
  }
}
async function seeded(storage: StoragePort) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ideas: [] }))
  const idea = await createLocalRepository(storage).createIdea({
    title: '실제 글감',
    keyword: '상품권 신청',
    memo: '',
    category: '라이프스타일',
    status: 'inbox',
  })
  await createResearchStore(storage).saveResearch({
    keyword: idea.keyword,
    related: [],
    intent: '',
    ideaId: idea.id,
    pc: 100,
    mobile: 500,
    blogTotal: 20,
    documentScope: '네이버 블로그 전체 기간',
    source: '직접 확인',
    checkedDate: '2026-01-01',
  })
  const context = { topic: '상품권', reviewmanTopics: ['상품권'] }
  const candidates = createCandidateStore(storage)
  candidates.save(
    analyzeCandidates(
      [
        {
          keyword: idea.keyword,
          pc: 100,
          mobile: 500,
          total: 600,
          mode: 'MANUAL',
          collectedAt: '2026-01-01',
          source: '직접 확인',
        },
      ],
      context,
    ),
    context,
    idea.id,
  )
  const candidate = candidates.list()[0],
    publishing = createPublishingStore(storage)
  const record = blankCompetition(candidate)
  record.reviewmanUrl = 'https://reviewman.kr/test'
  record.images = [
    {
      id: 'capture',
      name: 'proof.png',
      addedAt: '2026-01-01',
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    },
  ]
  publishing.saveCompetition(record)
  publishing.savePublication({
    id: 'post',
    account: 'nkr09134',
    keyword: idea.keyword,
    topic: '상품권',
    title: '발행 계획',
    status: 'planned',
    date: '',
    blogUrl: '',
    reviewmanUrl: 'https://reviewman.kr/test',
    ideaId: idea.id,
  })
  publishing.setHistoryChecked('nkr09134', true)
  return exportWorkspace(storage)
}
it('roundtrips all four stores to a different browser with IDs, captures and history intact', async () => {
  const source = memory(),
    target = memory(),
    original = await seeded(source)
  const incoming = await parseBackup(JSON.stringify(original))
  await restoreWorkspace(target, incoming, JSON.stringify(rawSnapshot(target)))
  const restored = await exportWorkspace(target)
  expect({ ...restored, exportedAt: original.exportedAt }).toEqual(original)
  expect(referenceIssues(restored)).toEqual([])
  // All normal writes continue in the restored workspace, including nested research adapter.
  const repo = createLocalRepository(target)
  await repo.updateIdea(original.ideas[0].id, { ...original.ideas[0], title: '복원 후 수정' })
  expect((await repo.listIdeas())[0].title).toBe('복원 후 수정')
  await repo.saveResearch(
    { ...original.research[0], source: '수정한 출처' },
    original.research[0].id,
  )
  expect((await repo.listResearch())[0].source).toBe('수정한 출처')
})
it('compares collisions, explicitly replaces and keeps the immediate previous data as automatic backup', async () => {
  const target = memory(),
    original = await seeded(target),
    incoming = structuredClone(original)
  incoming.ideas[0].title = '같은 ID 새 내용'
  expect(compareBackups(original, incoming).changed).toBe(1)
  const before = JSON.stringify(rawSnapshot(target))
  await restoreWorkspace(target, incoming, before)
  expect((await previousBackup(target)).ideas).toEqual(original.ideas)
  expect((await exportWorkspace(target)).ideas[0].title).toBe('같은 ID 새 내용')
  expect(target.getItem(STORAGE_KEY)).toBe(JSON.parse(before)[STORAGE_KEY])
})
it('rejects duplicate IDs and dangling or mismatched references before any write', async () => {
  const original = await seeded(memory())
  for (const mutate of [
    (b: typeof original) => {
      b.ideas.push(b.ideas[0])
    },
    (b: typeof original) => {
      b.candidates[0].ideaId = 'missing'
    },
    (b: typeof original) => {
      b.publishing.analyses[0].keyword = 'different'
    },
    (b: typeof original) => {
      b.publishing.analyses[0].candidateId = 'missing'
    },
  ]) {
    const b = structuredClone(original)
    mutate(b)
    await expect(parseBackup(JSON.stringify(b))).rejects.toThrow()
  }
})
it('quota failures leave legacy and previously restored workspaces byte-for-byte intact', async () => {
  const target = memory(),
    data = await seeded(target)
  for (let pass = 0; pass < 2; pass++) {
    const before = rawSnapshot(target),
      envelope = target.getItem(RESTORED_KEY)
    await expect(
      restoreWorkspace(
        {
          getItem: target.getItem,
          setItem: () => {
            throw new Error('QuotaExceeded')
          },
        },
        data,
        JSON.stringify(before),
      ),
    ).rejects.toThrow('기존 자료는 변경되지 않았습니다')
    expect(rawSnapshot(target)).toEqual(before)
    expect(target.getItem(RESTORED_KEY)).toBe(envelope)
    if (!pass) await restoreWorkspace(target, data, JSON.stringify(before))
  }
})
it('rejects stale previews instead of overwriting changes made in another tab', async () => {
  const target = memory(),
    data = await seeded(target),
    expected = JSON.stringify(rawSnapshot(target))
  await createLocalRepository(target).updateIdea(data.ideas[0].id, {
    ...data.ideas[0],
    title: '다른 탭 수정',
  })
  await expect(restoreWorkspace(target, data, expected)).rejects.toThrow('미리보기 이후')
  expect((await exportWorkspace(target)).ideas[0].title).toBe('다른 탭 수정')
})
it('never exports unrelated credentials and rejects unknown secret fields in imports', async () => {
  const target = memory(),
    original = await seeded(target)
  target.setItem('AccessToken', 'not-for-export')
  expect(JSON.stringify(await exportWorkspace(target))).not.toContain('not-for-export')
  const bad = { ...original, apiKey: 'not-for-export' }
  await expect(parseBackup(JSON.stringify(bad))).rejects.toThrow('알 수 없는 필드')
  await expect(parseBackup('{')).rejects.toThrow('JSON')
  await expect(parseBackup(JSON.stringify({ ...original, version: 99 }))).rejects.toThrow('형식')
})
