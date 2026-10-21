import { workspaceStorage } from './storage'
import { createResearchStore } from './research-store'
import {
  categories,
  statuses,
  validateIdea,
  type Idea,
  type IdeaInput,
  type WorkspaceRepository,
} from '../domain/models'
import { sampleConnections, sampleIdeas, sampleKeywords } from './fixtures'

export const STORAGE_KEY = 'prismkit.workspace.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
const storageMessage =
  '이 브라우저에 데이터를 저장할 수 없습니다. 저장 공간과 브라우저 설정을 확인해 주세요.'

function isIdea(value: unknown): value is Idea {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.title === 'string' &&
    item.title.trim().length > 0 &&
    item.title.length <= 120 &&
    typeof item.keyword === 'string' &&
    item.keyword.trim().length > 0 &&
    item.keyword.length <= 60 &&
    typeof item.memo === 'string' &&
    item.memo.length <= 2000 &&
    categories.some((category) => category === item.category) &&
    statuses.some((status) => status === item.status) &&
    typeof item.createdAt === 'string' &&
    Number.isFinite(Date.parse(item.createdAt)) &&
    typeof item.updatedAt === 'string' &&
    Number.isFinite(Date.parse(item.updatedAt))
  )
}

/** A local demo adapter. Existing data is never overwritten after a failed read or write. */
export function createLocalRepository(storage: StoragePort): WorkspaceRepository {
  storage = workspaceStorage(storage)
  function read(): Idea[] {
    let raw: string | null
    try {
      raw = storage.getItem(STORAGE_KEY)
    } catch {
      throw new Error(storageMessage)
    }
    if (raw === null) return structuredClone(sampleIdeas)
    try {
      const data: unknown = JSON.parse(raw)
      if (
        typeof data !== 'object' ||
        data === null ||
        !('version' in data) ||
        data.version !== 1 ||
        !('ideas' in data) ||
        !Array.isArray(data.ideas) ||
        !data.ideas.every(isIdea) ||
        new Set(data.ideas.map((idea) => idea.id)).size !== data.ideas.length
      )
        throw new Error('invalid')
      return data.ideas
    } catch {
      throw new Error(
        '저장된 글감 데이터를 읽을 수 없습니다. 원본 데이터는 보존되었습니다. 브라우저 저장소를 확인해 주세요.',
      )
    }
  }
  function write(ideas: Idea[]) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ideas }))
    } catch {
      throw new Error(storageMessage)
    }
  }
  return {
    ...createResearchStore(storage),
    async listIdeas() {
      return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async createIdea(input: IdeaInput) {
      const ideas = read()
      const now = new Date().toISOString()
      const idea: Idea = {
        ...validateIdea(input),
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      }
      write([idea, ...ideas])
      return idea
    },
    async updateIdea(id, input) {
      const ideas = read()
      const index = ideas.findIndex((idea) => idea.id === id)
      if (index < 0) throw new Error('글감을 찾을 수 없습니다. 목록을 새로고침해 주세요.')
      const updated = {
        ...ideas[index],
        ...validateIdea(input),
        updatedAt: new Date().toISOString(),
      }
      ideas[index] = updated
      write(ideas)
      return updated
    },
    async deleteIdea(id) {
      const ideas = read()
      if (!ideas.some((idea) => idea.id === id))
        throw new Error('이미 삭제된 글감입니다. 목록을 새로고침해 주세요.')
      write(ideas.filter((idea) => idea.id !== id))
    },
    async listKeywords() {
      return structuredClone(sampleKeywords)
    },
    async listConnections() {
      return structuredClone(sampleConnections)
    },
  }
}
