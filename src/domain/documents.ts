export interface DocumentEvidence {
  count: number | null
  source: string
  checkedDate: string
  scope: string
}
export function validDocuments(value: DocumentEvidence | undefined): boolean {
  if (
    !value ||
    !Number.isSafeInteger(value.count) ||
    value.count === null ||
    value.count < 0 ||
    typeof value.source !== 'string' ||
    !value.source.trim() ||
    value.source.length > 500 ||
    typeof value.scope !== 'string' ||
    !value.scope.trim() ||
    value.scope.length > 500 ||
    typeof value.checkedDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.checkedDate)
  )
    return false
  const time = Date.parse(value.checkedDate)
  return (
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value.checkedDate &&
    value.checkedDate <= new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  )
}
