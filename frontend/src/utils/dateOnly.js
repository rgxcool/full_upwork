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

const formatUtcDateOnly = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate()
  ).padStart(2, '0')}`

const parseDateOnlyAsUtc = (value) => {
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return null
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Adds calendar days to a date-only value without any timezone conversion.
 *
 * Doing the arithmetic in UTC keeps the selected calendar day stable even when
 * the range crosses a daylight-saving transition.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {number} days
 * @returns {string} YYYY-MM-DD, or an empty string when the value is invalid
 */
export const addDays = (value, days) => {
  const date = parseDateOnlyAsUtc(value)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + Number(days))
  return formatUtcDateOnly(date)
}

/**
 * Adds whole weeks to a date-only value.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {number} weeks
 * @returns {string} YYYY-MM-DD, or an empty string when the value is invalid
 */
export const addWeeks = (value, weeks) => addDays(value, Number(weeks) * 7)

/**
 * Returns the date-only value of the next Monday on or after the given day.
 *
 * The input is read by its local calendar day, which is what date pickers and
 * "today" refer to. Building the result from local calendar parts (instead of
 * calling toISOString on local midnight) avoids returning the previous day in
 * timezones ahead of UTC, such as Sweden.
 *
 * @param {Date|string|number} value
 * @returns {string} YYYY-MM-DD, or an empty string when the value is invalid
 */
export const getNextMonday = (value = new Date()) => {
  const dateOnly = toDateOnly(value)
  if (!dateOnly) return ''

  const [year, month, day] = dateOnly.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = date.getDay()
  const offset = weekday === 1 ? 0 : (8 - weekday) % 7
  date.setDate(date.getDate() + offset)
  return toDateOnly(date)
}
