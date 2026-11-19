import { describe, expect, it } from 'vitest'
import {
  currentModuleLabel,
  isCourseComplete,
  isCurrentModule,
} from '@/utils/currentModule.js'

describe('currentModule helpers', () => {
  const activeCard = {
    currentModule: { moduleNumber: 3, title: 'Reflektion', status: 'Pågår' },
    progress: { completed: 2, total: 4, percent: 50 },
  }

  it('labels an active module with its number and title', () => {
    expect(currentModuleLabel(activeCard)).toBe('Modul 3 · Reflektion')
  })

  it('falls back to the module number when the title is missing', () => {
    expect(currentModuleLabel({
      currentModule: { moduleNumber: 2, title: '' },
      progress: { completed: 1, total: 3, percent: 33 },
    })).toBe('Modul 2 · Modul 2')
  })

  it('reports completion only when every assignment is accepted', () => {
    expect(isCourseComplete(activeCard)).toBe(false)
    expect(isCourseComplete({
      currentModule: null,
      progress: { completed: 2, total: 2, percent: 100 },
    })).toBe(true)
    expect(isCourseComplete({ currentModule: null, progress: null })).toBe(false)
  })

  it('uses the completed copy when no module remains', () => {
    expect(currentModuleLabel({
      currentModule: null,
      progress: { completed: 2, total: 2, percent: 100 },
    })).toBe('Alla moduler klara')
    expect(currentModuleLabel({ currentModule: null, progress: null })).toBe('')
  })

  it('matches only the current module number', () => {
    expect(isCurrentModule(activeCard, { moduleNumber: 3 })).toBe(true)
    expect(isCurrentModule(activeCard, { moduleNumber: 2 })).toBe(false)
    expect(isCurrentModule({ currentModule: null }, { moduleNumber: 3 })).toBe(false)
  })
})
