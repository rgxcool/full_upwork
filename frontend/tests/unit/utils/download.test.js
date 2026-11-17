import { describe, it, expect } from 'vitest'
import * as D from '@/utils/download.js'
describe('download', () => {
  it('exports functions', () => {
    expect(Object.keys(D).length).toBeGreaterThan(0)
  })
})
