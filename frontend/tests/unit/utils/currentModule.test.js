import { describe, expect, it } from 'vitest'
import {
  activityStatusLabel,
  activityStatusTone,
  activityToCard,
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

  it('maps batch activity results to the shared card shape', () => {
    const card = activityToCard({
      totalModules: 3,
      completedModules: 1,
      moduleStatuses: [
        { moduleNumber: 1, title: 'Läsning', completed: true },
        { moduleNumber: 2, title: 'Delprov', completed: false, behind: true },
        { moduleNumber: 3, title: 'Reflektion', completed: false },
      ],
    })

    expect(card.currentModule).toEqual({ moduleNumber: 2, title: 'Delprov' })
    expect(currentModuleLabel(card)).toBe('Modul 2 · Delprov')
    expect(isCourseComplete(card)).toBe(false)
  })

  it('uses the completed copy when every batch module is done', () => {
    const card = activityToCard({
      totalModules: 2,
      completedModules: 2,
      moduleStatuses: [
        { moduleNumber: 1, title: 'Läsning', completed: true },
        { moduleNumber: 2, title: 'Delprov', completed: true },
      ],
    })

    expect(currentModuleLabel(card)).toBe('Alla moduler klara')
    expect(isCourseComplete(card)).toBe(true)
  })

  it('has no module label when a batch result has no modules', () => {
    expect(currentModuleLabel(activityToCard(null))).toBe('')
    expect(currentModuleLabel(activityToCard({ totalModules: 0, completedModules: 0, moduleStatuses: [] }))).toBe('')
  })

  it('labels and colours the batch overall status in Swedish', () => {
    expect(activityStatusLabel('on schedule')).toBe('Pågår')
    expect(activityStatusLabel('behind')).toBe('Bakom')
    expect(activityStatusLabel('inactive')).toBe('Inaktiv')
    expect(activityStatusLabel('completed')).toBe('Klar')
    expect(activityStatusLabel(undefined)).toBe('Okänd')
    expect(activityStatusTone('completed')).toBe('success')
    expect(activityStatusTone('behind')).toBe('warning')
    expect(activityStatusTone('inactive')).toBe('error')
    expect(activityStatusTone('on schedule')).toBe('primary')
    expect(activityStatusTone(undefined)).toBe('grey')
  })
})
