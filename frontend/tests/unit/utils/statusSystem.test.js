import { describe, it, expect } from 'vitest'
import { aplStatusColor, getActivityStatus } from '@/utils/statusSystem.js'
describe('statusSystem', () => {
  it('aplStatusColor', () => { expect(aplStatusColor('GREEN')).toBeTruthy() })
  it('getActivityStatus', () => { expect(getActivityStatus('active')).toBeTruthy() })
})
