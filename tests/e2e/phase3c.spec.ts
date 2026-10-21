import { expect, test, type Page } from '@playwright/test'

// Synthetic ClipboardEvent/DataTransfer tests verify browser handling, not OS screenshot shortcuts.
async function paste(page: Page, names: string[], target = 'body', text = '') {
  return page.evaluate(
    async ({ names, target, text }) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 32
      const results = []
      for (const name of names) {
        const type = name.endsWith('.jpg')
          ? 'image/jpeg'
          : name.endsWith('.webp')
            ? 'image/webp'
            : 'image/png'
        const c = canvas.getContext('2d')!
        c.clearRect(0, 0, 32, 32)
        const hash = [...name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 0)
        c.fillStyle = `rgb(${hash & 255},${(hash >>> 8) & 255},${(hash >>> 16) & 255})`
        c.fillRect(0, 0, 32, 32)
        c.fillStyle = '#fff'
        c.fillText(name, 0, 16)
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type))
        const transfer = new DataTransfer()
        transfer.items.add(new File([blob], name, { type }))
        if (text) transfer.setData('text/plain', text)
        const event = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        })
        document.querySelector(target)!.dispatchEvent(event)
        results.push(event.defaultPrevented)
      }
      return results
    },
    { names, target, text },
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', () => {
    throw new Error('Screenshot input must not call any API')
  })
  await page.goto('/captures')
})

test('Windows/Mac image paste shares the pipeline, queues repeated inputs and restores IndexedDB images', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  expect(await paste(page, ['Windows.png', 'Mac.jpg', 'clipboard.webp', 'Windows.png'])).toEqual([
    true,
    true,
    true,
    true,
  ])
  await expect(page.locator('.capture-card')).toHaveCount(3)
  await expect(page.getByRole('status')).toContainText('동일 원본 중복 제외')
  await expect(page.getByText('현재 등록 이미지: 3 / 20장')).toBeVisible()
  await expect(page.locator('.capture-card').first()).toContainText('Windows.png')
  await expect(page.locator('.capture-card').nth(1)).toContainText('Mac.jpg')
  await page.reload()
  await expect(page.locator('.capture-card')).toHaveCount(3)
  for (const name of ['Windows.png', 'Mac.jpg', 'clipboard.webp'])
    await expect(page.getByRole('img', { name, exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('plain text and mixed clipboard keep editing defaults; listener is removed on navigation', async ({
  page,
}) => {
  const plain = await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', '붙여넣을 글감')
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(plain).toBe(false)
  // Use the actual manual draft editor, plus an editable descendant for rich-text safety.
  await page.getByRole('button', { name: '수동 글감 입력', exact: true }).click()
  await page.getByLabel('글감 제목', { exact: true }).fill('기존 제목')
  expect(await paste(page, ['mixed.png'], '.capture-editor input', '기존 편집 우선')).toEqual([
    false,
  ])
  await expect(page.getByLabel('글감 제목', { exact: true })).toHaveValue('기존 제목')
  await page.evaluate(() => {
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    editor.innerHTML = '<span id="editable-child">메모</span>'
    document.body.append(editor)
  })
  expect(await paste(page, ['mixed.png'], '#editable-child', '메모')).toEqual([false])
  await expect(page.locator('.capture-card')).toHaveCount(0)
  // SPA navigation keeps the same document: a leaked window listener would still consume this event.
  if (await page.getByRole('button', { name: '메뉴 열기', exact: true }).isVisible())
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click()
  await page.getByRole('link', { name: 'Prismkit 대시보드' }).click()
  expect(await paste(page, ['other-route.png'])).toEqual([false])
  await page.goBack()
  await expect(page.getByRole('heading', { name: '캡처 글감 수집' })).toBeVisible()
  expect(await paste(page, ['one-listener.png'])).toEqual([true])
  await expect(page.getByRole('status')).toContainText('로컬 보관 완료: 1장')
  await expect(page.getByRole('status')).not.toContainText('중복')
})

test('floating-thumbnail file data highlights the drop zone; URL-only payload never claims success', async ({
  page,
}) => {
  const transfer = await page.evaluateHandle(async () => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), 'image/png'))
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'floating-thumbnail.png', { type: 'image/png' }))
    return transfer
  })
  const zone = page.locator('.capture-drop')
  await zone.dispatchEvent('dragenter', { dataTransfer: transfer })
  await expect(zone).toHaveClass(/is-dragging/)
  await zone.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(zone).not.toHaveClass(/is-dragging/)
  await expect(page.getByRole('img', { name: 'floating-thumbnail.png' })).toBeVisible()
  await zone.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByRole('status')).toContainText('중복')
  const url = await page.evaluateHandle(() => {
    const t = new DataTransfer()
    t.setData('text/uri-list', 'https://example.invalid/capture.png')
    return t
  })
  await zone.dispatchEvent('drop', { dataTransfer: url })
  await expect(page.getByRole('alert')).toContainText(
    '브라우저가 이미지 파일을 제공하지 않았습니다',
  )
  await expect(page.locator('.capture-card')).toHaveCount(1)
  expect(page.url()).toContain('/captures')
})

test('paste count limit preserves existing images and unsupported MIME reports the reason', async ({
  page,
}) => {
  await paste(
    page,
    Array.from({ length: 20 }, (_, i) => `paste-${i}.png`),
  )
  await expect(page.locator('.capture-card')).toHaveCount(20)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  expect(await paste(page, ['overflow.png'])).toEqual([true])
  await expect(page.getByRole('status')).toContainText('이미지 개수 초과')
  await page.evaluate(() => {
    const t = new DataTransfer()
    t.items.add(new File(['gif'], 'unsupported.gif', { type: 'image/gif' }))
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: t }),
    )
  })
  await expect(page.getByRole('status')).toContainText('지원하지 않는 이미지 형식')
  await expect(page.locator('.capture-card')).toHaveCount(20)
})
