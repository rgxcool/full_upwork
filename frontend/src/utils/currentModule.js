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
