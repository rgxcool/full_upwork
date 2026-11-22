import { describe, it, expect } from 'vitest'
import { SELECTABLE_MUNICIPALITIES } from '@/constants/municipalities.js'
// The backend enum is plain ESM with no dependencies, so the frontend can check it directly.
import { ALL_MUNICIPALITIES } from '../../../../backend/src/config/municipalities.js'

describe('SELECTABLE_MUNICIPALITIES', () => {
  it('is the backend enum minus the legacy Göteborg and Stockholm (catches drift)', () => {
    const expected = ALL_MUNICIPALITIES.filter((m) => m !== 'Göteborg' && m !== 'Stockholm')
    expect([...SELECTABLE_MUNICIPALITIES].sort()).toEqual([...expected].sort())
  })
})
