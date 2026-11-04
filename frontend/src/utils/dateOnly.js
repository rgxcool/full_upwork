/**
 * Formats a date-picker value as the calendar date the user selected.
 *
 * Date pickers return a Date at local midnight. Calling toISOString() on that
 * value converts it to UTC and shifts the date backwards for every timezone
 * ahead of UTC (for example Sweden), so selecting 2026-03-15 was sent to the
 * API as 2026-03-14. Using the local getters keeps the selected calendar day.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {string} YYYY-MM-DD, or an empty string when the value is invalid
 */
export const toDateOnly = (value) => {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''

    // Already a date-only value: validate it without any UTC conversion.
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1])
      const month = Number(dateOnlyMatch[2])
      const day = Number(dateOnlyMatch[3])
      const candidate = new Date(year, month - 1, day)
      if (
        candidate.getFullYear() !== year ||
        candidate.getMonth() !== month - 1 ||
        candidate.getDate() !== day
      ) {
        return ''
      }
      return trimmed
    }

    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return ''
    return toDateOnly(parsed)
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
