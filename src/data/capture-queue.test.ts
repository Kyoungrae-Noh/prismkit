import { expect, it, vi } from 'vitest'
import { createCaptureQueue } from './capture-queue'
import { CAPTURE_TOTAL_MAX, emptyCaptures, type CaptureImage } from '../domain/captures'

const file = (name: string) => new File(['png'], name, { type: 'image/png' })
const meta = (name: string, size = 3): CaptureImage => ({
  id: name,
  name,
  size,
  type: 'image/png',
  addedAt: new Date().toISOString(),
})
function setup() {
  let data = emptyCaptures()
  const store = {
    read: () => structuredClone(data),
    write: vi.fn((next) => {
      data = structuredClone(next)
    }),
  }
  const prepare = vi.fn(async (f: File) => ({ meta: meta(f.name, f.size), blob: f }))
  const vault = { get: vi.fn(), put: vi.fn(async () => {}) }
  const complete = vi.fn(),
    saved = vi.fn(),
    progress = vi.fn()
  const queue = createCaptureQueue({ store, prepare, vault, complete, saved, progress })
  const done = () => vi.waitFor(() => expect(complete).toHaveBeenCalled())
  return { store, prepare, vault, complete, saved, queue, done }
}
it('serializes simultaneous paste, drop and picker inputs with hash dedup and stable order', async () => {
  const t = setup()
  t.queue.enqueue([file('a')])
  t.queue.enqueue([file('b'), file('a')])
  t.queue.enqueue([file('c')])
  await t.done()
  expect(t.store.read().images.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  expect(t.vault.put).toHaveBeenCalledTimes(3)
  expect(t.complete.mock.calls[0][0]).toMatchObject({ added: 3, failed: [] })
  expect(t.complete.mock.calls[0][0].notes[0]).toContain('중복')
})
it('preserves changes made during an asynchronous image write', async () => {
  const t = setup()
  t.vault.put.mockImplementation(async () => {
    const latest = t.store.read()
    latest.images.push(meta('other-tab'))
    t.store.write(latest)
  })
  t.queue.enqueue([file('new')])
  await t.done()
  expect(t.store.read().images.map((i) => i.id)).toEqual(['other-tab', 'new'])
})
it('rechecks duplicates after vault write', async () => {
  const t = setup()
  t.vault.put.mockImplementation(async () => {
    const latest = t.store.read()
    latest.images.push(meta('new'))
    t.store.write(latest)
  })
  t.queue.enqueue([file('new')])
  await t.done()
  expect(t.store.read().images).toHaveLength(1)
  expect(t.complete.mock.calls[0][0].added).toBe(0)
})
it('enforces count, total bytes and bounded pending queue with distinct errors', async () => {
  const t = setup()
  t.store.write({ ...emptyCaptures(), images: Array.from({ length: 20 }, (_, i) => meta(`${i}`)) })
  t.queue.enqueue([file('overflow')])
  await t.done()
  expect(t.complete.mock.calls[0][0].notes[0]).toContain('이미지 개수 초과')
  expect(t.vault.put).not.toHaveBeenCalled()
  const u = setup()
  u.store.write({ ...emptyCaptures(), images: [meta('full', CAPTURE_TOTAL_MAX)] })
  u.queue.enqueue([file('overflow')])
  await u.done()
  expect(u.complete.mock.calls[0][0].notes[0]).toContain('전체 저장 용량 초과')
  expect(u.store.read().images).toHaveLength(1)
  const v = setup()
  expect(() => v.queue.enqueue(Array.from({ length: 21 }, () => file('x')))).toThrow(
    '한 번에 최대 20장',
  )
  v.queue.enqueue(Array.from({ length: 20 }, (_, i) => file(`${i}`)))
  expect(() => v.queue.enqueue([file('extra')])).toThrow('처리 대기 이미지 개수 초과')
  await v.done()
})
it.each(['vault', 'metadata'])(
  'preserves existing data on %s failure and can retry',
  async (failure) => {
    const t = setup()
    t.store.write({ ...emptyCaptures(), images: [meta('existing')] })
    if (failure === 'vault') t.vault.put.mockRejectedValueOnce(new Error('용량 부족'))
    else
      t.store.write.mockImplementationOnce(() => {
        throw new Error('메타데이터 저장 실패')
      })
    const added = file('new')
    t.queue.enqueue([added])
    await t.done()
    expect(t.store.read().images.map((i) => i.id)).toEqual(['existing'])
    expect(t.complete.mock.calls[0][0].failed).toEqual([added])
    t.complete.mockClear()
    t.queue.enqueue([added])
    await t.done()
    expect(t.store.read().images.map((i) => i.id)).toEqual(['existing', 'new'])
  },
)
it('navigation cancels queued work and prevents late metadata commits', async () => {
  const t = setup()
  let release!: () => void
  t.vault.put.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  t.queue.enqueue([file('a'), file('b')])
  await vi.waitFor(() => expect(t.vault.put).toHaveBeenCalled())
  t.queue.close()
  release()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(t.queue.enqueue([file('c')])).toBe(false)
  expect(t.store.write).not.toHaveBeenCalled()
  expect(t.prepare).toHaveBeenCalledTimes(1)
  expect(t.saved).not.toHaveBeenCalled()
  expect(t.complete).not.toHaveBeenCalled()
})
