// Read synchronously during paste/drop: browsers may clear the transfer after the event.
// Never retrieve remote HTML/URL images or use privileged clipboard APIs.
export function transferFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return []
  const files = Array.from(transfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  return files.length ? files : Array.from(transfer.files ?? [])
}

export function pastedImages(event: ClipboardEvent): File[] {
  if (event.defaultPrevented || !event.clipboardData) return []
  const target = event.target
  const editing =
    target instanceof Element &&
    (target.closest('input, textarea') !== null ||
      (target instanceof HTMLElement && target.isContentEditable))
  if (editing && Array.from(event.clipboardData.types).some((type) => type.startsWith('text/')))
    return []
  return transferFiles(event.clipboardData).filter((file) => file.type.startsWith('image/'))
}
