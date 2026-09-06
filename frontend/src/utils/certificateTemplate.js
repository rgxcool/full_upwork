// Renders a certificate template HTML string with the given data object by
// substituting {{placeholder}} tokens and {{#flag}}...{{/flag}} sections.
// This is intentionally a minimal, dependency-free renderer used only for the
// admin live preview on the client; the real PDF is produced via browser print.

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g
const escapeRegex = (s) => s.replace(ESCAPE_RE, '\\$&')

export function renderTemplate(template, data = {}, sections = {}) {
  let html = template || ''

  // Boolean flag sections: {{#flag}}...{{/flag}} rendered when truthy.
  html = html.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
    const value = data[key]
    const truthy = value === true || value === 'true' || (typeof value === 'string' && value.length > 0)
    if (sections[key] !== undefined) return sections[key] ? body : ''
    return truthy ? body : ''
  })

  // Negated sections: {{^flag}}...{{/flag}} rendered when falsy.
  html = html.replace(/\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
    const value = data[key]
    const truthy = value === true || value === 'true' || (typeof value === 'string' && value.length > 0)
    return truthy ? '' : body
  })

  // Plain value placeholders.
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const value = data[key]
    if (value === undefined || value === null) return ''
    return String(value)
  })

  // Remove any leftover v-if markers meant for alternate renderers.
  html = html.replace(/\s*v-if="[^"]*"/g, '')

  return html
}

// A sensible set of preview values so the admin can see a realistic sample.
export const SAMPLE_CERTIFICATE_DATA = {
  studentName: 'Anna Elevsson',
  personalNumber: '19900101-1234',
  courseName: 'Engelska 5',
  courseCode: 'ENGENG05',
  packageName: 'Samhällsvetenskapsprogrammet',
  periodStart: '2025-08-01',
  periodEnd: '2026-06-12',
  completedAt: '2026-05-20',
  teacherName: 'Maria Lärare',
  grade: 'B',
  schoolName: 'Mindful Learning',
  certificateNumber: 'ML-2026-00001',
  issuedDate: '2026-08-31',
  signerName: 'Rektor Anna Svensson',
  signerTitle: 'Rektor',
}
