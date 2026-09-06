// Swedish labels for notification types, shared between the NavBar bell
// and the admin notification management page so both stay consistent.

const NOTIFICATION_TYPE_LABELS = {
  grades_pending: 'Betyg väntar',
  action_plan_required: 'Åtgärdsplan krävs',
  global_action_plan_required: 'Handlingsplan krävs',
  document_uploaded: 'Dokument uppladdat',
  comment_added: 'Kommentar',
  exam_request: 'Prövningsförfrågan',
  dropout: 'Avbrott',
  inactivity_action: 'Inaktivitetsärende',
  final_exam_soon: 'Slutprov snart',
  signing_required: 'Signering krävs',
  grade_locked: 'Betyg låst',
  grade_unlocked: 'Betyg upplåst',
  meeting_booked: 'Möte bokat',
  apl_warning: 'APL-varning',
  apl_complete: 'APL avslutad',
  diploma_ready: 'Diplom klart',
  studyplan_changed: 'Studieplan',
  failing_grade: 'F-betyg',
  submission: 'Inlämning',
  system_alert: 'Systemmeddelande',
}

export function notificationTypeLabel(type) {
  return NOTIFICATION_TYPE_LABELS[type] || type || 'Okänd'
}

// Options for the type filter in the admin management page.
export const NOTIFICATION_TYPE_OPTIONS = Object.entries(NOTIFICATION_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
)