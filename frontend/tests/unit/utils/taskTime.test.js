import { remainingLabel, isTaskOverdue } from '@/utils/taskTime.js'
import { describe, it, expect } from 'vitest'

describe('taskTime util', () => {
  const now = new Date(2026, 8, 1, 10, 0, 0)

  it('formats future remaining time', () => {
    expect(remainingLabel('2026-09-01', '14:30', now)).toBe('Om 4 h 30 min')
    expect(remainingLabel('2026-09-03', '10:00', now)).toBe('Om 2 d 0 h')
    expect(remainingLabel('2026-09-01', '10:03', now)).toBe('Om 3 min')
  })

  it('formats overdue time', () => {
    expect(remainingLabel('2026-08-30', '10:00', now)).toBe('Försenad 2 d 0 h')
  })

  it('handles missing or invalid dates', () => {
    expect(remainingLabel(null, null, now)).toBe('')
    expect(remainingLabel('', '12:00', now)).toBe('')
    expect(remainingLabel('not-a-date', null, now)).toBe('')
  })

  it('isTaskOverdue flags only past due datetimes', () => {
    expect(isTaskOverdue('2026-08-30', '10:00', now)).toBe(true)
    expect(isTaskOverdue('2026-09-05', null, now)).toBe(false)
    expect(isTaskOverdue(null, null, now)).toBe(false)
  })
})