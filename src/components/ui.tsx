import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Inbox, X } from 'lucide-react'
import { statusLabels, type IdeaStatus } from '../domain/models'

export const formatNumber = (value: number) => new Intl.NumberFormat('ko-KR').format(value)
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(value))
export function StatusBadge({ status }: { status: IdeaStatus }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  )
}
export function Growth({ value }: { value: number }) {
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`growth ${value < 0 ? 'negative' : ''}`}>
      <Icon size={14} />
      {Math.abs(value)}%
    </span>
  )
}
export function Sparkline({
  values,
  color = '#67947b',
  label,
}: {
  values: number[]
  color?: string
  label: string
}) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = values
    .map(
      (value, i) =>
        `${(i * 98) / (values.length - 1) + 1},${29 - ((value - min) / (max - min || 1)) * 25}`,
    )
    .join(' ')
  return (
    <svg className="sparkline" viewBox="0 0 100 34" role="img" aria-label={label}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={27} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose(): void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-inner">
        <div className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
