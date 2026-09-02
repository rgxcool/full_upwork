const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MIN_MS = 60 * 1000

export function remainingLabel(dueDate, dueTime, now = new Date()) {
  if (!dueDate) return ''
  const due = new Date(`${dueDate}T${dueTime || '23:59'}:00`)
  if (Number.isNaN(due.getTime())) return ''

  const diffMs = due.getTime() - now.getTime()
  const overdue = diffMs < 0
  const abs = Math.abs(diffMs)
  const days = Math.floor(abs / DAY_MS)
  const hours = Math.floor((abs % DAY_MS) / HOUR_MS)
  const mins = Math.floor((abs % HOUR_MS) / MIN_MS)

  const prefix = overdue ? 'Försenad' : 'Om'
  if (days > 0) return `${prefix} ${days} d ${hours} h`
  if (hours > 0) return `${prefix} ${hours} h ${mins} min`
  return `${prefix} ${Math.max(mins, 1)} min`
}

export function isTaskOverdue(dueDate, dueTime, now = new Date()) {
  if (!dueDate) return false
  const due = new Date(`${dueDate}T${dueTime || '23:59'}:00`)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() < now.getTime()
}