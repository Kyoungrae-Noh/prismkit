/** One KST calendar day. An upstream block is never cleared by a day rollover. */
export const DAILY_LIMIT = 30
export interface Budget {
  calls: number
  last: number
  blocked: boolean
  busyUntil: number
  version?: 2
  day?: string
  migrationDay?: string
}
export interface Usage {
  used: number
  remaining: number
  limit: number
  day: string
  resetsAt: string
  lastQueryAt: string | null
  blocked: boolean
  migration: boolean
}
export function kstDay(time: number) {
  return new Date(time + 9 * 3600000).toISOString().slice(0, 10)
}
export const emptyBudget = (): Budget => ({
  version: 2,
  day: '',
  calls: 0,
  last: 0,
  blocked: false,
  busyUntil: 0,
})
export function currentBudget(value: Budget, time: number): Budget {
  if (
    !value ||
    !Number.isSafeInteger(value.calls) ||
    value.calls < 0 ||
    !Number.isFinite(value.last) ||
    !Number.isFinite(value.busyUntil) ||
    typeof value.blocked !== 'boolean' ||
    (value.version !== undefined && value.version !== 2)
  )
    throw new Error('Invalid budget state')
  const day = kstDay(time)
  // Legacy deployments retain the lifetime count AND the old 10-call ceiling for the migration day.
  // No reset on deployment/first access. Next KST day receives the new daily allowance.
  if (value.version !== 2) return { ...value, version: 2, day, migrationDay: day }
  if (
    typeof value.day !== 'string' ||
    (value.day !== '' &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value.day) || !Number.isFinite(Date.parse(value.day)))) ||
    (!value.day && value.calls !== 0)
  )
    throw new Error('Invalid budget date')
  if (value.day && value.day > day) throw new Error('Budget clock moved backwards')
  if (value.day !== day) return { ...value, day, calls: 0 }
  return { ...value }
}
export function budgetUsage(state: Budget, time: number): Usage {
  const value = currentBudget(state, time)
  const migration = value.migrationDay === value.day
  const limit = migration ? 10 : DAILY_LIMIT
  return {
    used: value.calls,
    remaining: Math.max(0, limit - value.calls),
    limit,
    day: value.day!,
    resetsAt: new Date(Date.parse(`${value.day}T00:00:00+09:00`) + 86400000).toISOString(),
    lastQueryAt: value.last ? new Date(value.last).toISOString() : null,
    blocked: value.blocked,
    migration,
  }
}
