import { describe, expect, it } from 'vitest'
import {
    aplStatusColor,
    getActivityStatus,
} from '@/utils/statusSystem.js'

describe('statusSystem helpers', () => {
    it('exports the status helpers', () => {
        expect(typeof aplStatusColor).toBe('function')
        expect(typeof getActivityStatus).toBe('function')
    })

    it('maps supported APL states to their legacy color names', () => {
        expect(aplStatusColor('PURPLE')).toBe('purple')
        expect(aplStatusColor('GREEN')).toBe('green')
    })

    it('uses gray for an unknown APL state', () => {
        expect(aplStatusColor('UNKNOWN')).toBe('gray')
    })

    it('resolves known activity states and falls back for missing values', () => {
        expect(getActivityStatus('inactive')).toEqual({
            label: 'Inaktiv',
            hue: 'danger',
        })
        expect(getActivityStatus('unrecognized')).toEqual({
            label: 'unrecognized',
            hue: 'neutral',
        })
        expect(getActivityStatus(null)).toEqual({
            label: 'Okänt',
            hue: 'neutral',
        })
    })
})
