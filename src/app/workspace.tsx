import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Connection, Idea, IdeaInput, Keyword, WorkspaceRepository } from '../domain/models'

interface Workspace {
  researchRepository: Pick<WorkspaceRepository, 'listResearch' | 'saveResearch'>
  ideas: Idea[]
  keywords: Keyword[]
  connections: Connection[]
  loading: boolean
  error: string | null
  refresh(silent?: boolean): Promise<void>
  saveIdea(input: IdeaInput, id?: string): Promise<void>
  removeIdea(id: string): Promise<void>
}
const WorkspaceContext = createContext<Workspace | null>(null)
export function WorkspaceProvider({
  repository,
  children,
}: {
  repository: WorkspaceRepository
  children: ReactNode
}) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const [nextIdeas, nextKeywords, nextConnections] = await Promise.all([
          repository.listIdeas(),
          repository.listKeywords(),
          repository.listConnections(),
        ])
        setIdeas(nextIdeas)
        setKeywords(nextKeywords)
        setConnections(nextConnections)
      } catch (error) {
        setError(error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [repository],
  )
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const sync = () => {
      void refresh()
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [refresh])
  async function saveIdea(input: IdeaInput, id?: string) {
    if (id) await repository.updateIdea(id, input)
    else await repository.createIdea(input)
    setIdeas(await repository.listIdeas())
  }
  async function removeIdea(id: string) {
    await repository.deleteIdea(id)
    setIdeas(await repository.listIdeas())
  }
  return (
    <WorkspaceContext.Provider
      value={{
        researchRepository: repository,
        ideas,
        keywords,
        connections,
        loading,
        error,
        refresh,
        saveIdea,
        removeIdea,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('WorkspaceProvider is required')
  return context
}
