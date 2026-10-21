import type { Page } from '@playwright/test'
export async function mockAnalysisBudget(page: Page, remaining = 30) {
  await page.route('**/api/searchad/usage', (route) =>
    route.fulfill({
      json: {
        used: 30 - remaining,
        remaining,
        limit: 30,
        day: new Date().toISOString().slice(0, 10),
        resetsAt: new Date(Date.now() + 86400000).toISOString(),
        lastQueryAt: null,
        blocked: false,
        migration: false,
      },
    }),
  )
}
