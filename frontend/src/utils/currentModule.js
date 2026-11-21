// Shared presentation helpers for the `currentModule` payload produced by
// enrollmentService.buildCourseCards. Both the student course cards and the
// staff course-card view use these so labels and completion state stay in sync.

export function isCurrentModule(card, module) {
  return !!card?.currentModule && card.currentModule.moduleNumber === module?.moduleNumber
}

// A card with no assignment-bearing modules has `progress: null` and no current
// module — that is a different state from "every assignment is accepted".
export function isCourseComplete(card) {
  const progress = card?.progress
  return !!progress && progress.total > 0 && progress.completed >= progress.total
}

export function currentModuleLabel(card) {
  if (card?.currentModule) {
    const number = card.currentModule.moduleNumber
    const title = card.currentModule.title || `Modul ${number}`
    return `Modul ${number} · ${title}`
  }
  return isCourseComplete(card) ? 'Alla moduler klara' : ''
}

// A batch activity-status result exposes `moduleStatuses` instead of the
// course-card `currentModule`/`progress` fields. Map it into that shape so the
// shared label and completion helpers above stay the single source of truth.
export function activityToCard(activity) {
  if (!activity) return null
  const statuses = Array.isArray(activity.moduleStatuses) ? activity.moduleStatuses : []
  const next = statuses.find((m) => !m.completed) || null
  const total = activity.totalModules ?? statuses.length
  const completed = activity.completedModules ?? statuses.filter((m) => m.completed).length
  return {
    currentModule: next
      ? { moduleNumber: next.moduleNumber, title: next.title }
      : null,
    progress: total > 0 || completed > 0 ? { total, completed } : null,
  }
}

const ACTIVITY_STATUS_LABELS = {
  'on schedule': 'Pågår',
  behind: 'Bakom',
  inactive: 'Inaktiv',
  completed: 'Klar',
}

const ACTIVITY_STATUS_TONES = {
  'on schedule': 'primary',
  behind: 'warning',
  inactive: 'error',
  completed: 'success',
}

export function activityStatusLabel(status) {
  return ACTIVITY_STATUS_LABELS[status] || 'Okänd'
}

export function activityStatusTone(status) {
  return ACTIVITY_STATUS_TONES[status] || 'grey'
}
