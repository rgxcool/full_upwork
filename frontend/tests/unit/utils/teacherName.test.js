import { describe, expect, it } from 'vitest'
import { teacherColor, teacherDisplayName, teacherEmail } from '@/utils/teacherName.js'

// #102: a populated teacher reference is the User; the /teachers DTO also repeats it as userId.
const populatedUser = { _id: 'u1', username: 'Test Lärare', email: 'test.larare@example.se' }
const dto = { _id: 'u1', subject: 'Matematik', userId: { _id: 'u1', username: 'Test Lärare', email: 'test.larare@example.se' } }

describe('teacherDisplayName', () => {
  it('reads the username of a populated teacher User', () => {
    expect(teacherDisplayName(populatedUser)).toBe('Test Lärare')
  })

  it('reads the account of a /teachers DTO', () => {
    expect(teacherDisplayName(dto)).toBe('Test Lärare')
  })

  it('falls back to name, then email', () => {
    expect(teacherDisplayName({ name: 'Namn' })).toBe('Namn')
    expect(teacherDisplayName({ email: 'x@example.se' })).toBe('x@example.se')
  })

  it('returns the fallback for an unpopulated id or missing teacher', () => {
    expect(teacherDisplayName('64b000000000000000000011', '–')).toBe('–')
    expect(teacherDisplayName(null, 'Ej tilldelad')).toBe('Ej tilldelad')
    expect(teacherDisplayName({}, '-')).toBe('-')
  })
})

describe('teacherEmail', () => {
  it('reads the e-mail from either shape', () => {
    expect(teacherEmail(populatedUser)).toBe('test.larare@example.se')
    expect(teacherEmail(dto)).toBe('test.larare@example.se')
    expect(teacherEmail(undefined, 'Ingen e-post')).toBe('Ingen e-post')
  })
})

describe('teacherColor', () => {
  it('reads teacherProfile.colorCode on a populated User, colorCode on the DTO', () => {
    expect(teacherColor({ teacherProfile: { colorCode: '#3cb44b' } })).toBe('#3cb44b')
    expect(teacherColor({ colorCode: '#e6194b' })).toBe('#e6194b')
    expect(teacherColor('64b000000000000000000011', '#94a3b8')).toBe('#94a3b8')
  })
})
