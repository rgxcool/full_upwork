import { describe, expect, it } from 'vitest'
import {
  contentItemLabel,
  contentMeta,
  formatPlannedDate,
  PLANNED_DATE_LABEL,
  shouldShowAvsnitt,
  sortedAvsnitt,
  sortedByOrder,
  visibleContentItems,
} from '@/utils/courseContent.js'

describe('planned date display helpers', () => {
  it('uses the locked Swedish label', () => {
    expect(PLANNED_DATE_LABEL).toBe('Planerat inlämningsdatum')
  })

  it('formats Date and ISO values but hides missing or invalid ones', () => {
    expect(formatPlannedDate(new Date('2026-11-23T00:00:00.000Z'))).toBe('2026-11-23')
    expect(formatPlannedDate('2026-11-23T00:00:00.000Z')).toBe('2026-11-23')
    expect(formatPlannedDate(null)).toBe('')
    expect(formatPlannedDate('not-a-date')).toBe('')
  })
})

describe('sortedByOrder', () => {
  it('sorts numeric order ascending', () => {
    const items = [{ order: 3, id: 'c' }, { order: 1, id: 'a' }, { order: 2, id: 'b' }]
    expect(sortedByOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('is stable when order values are equal', () => {
    const items = [{ order: 1, id: 'a' }, { order: 1, id: 'b' }, { order: 1, id: 'c' }]
    expect(sortedByOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts items with missing or NaN order after ordered items, keeping their index order', () => {
    const items = [
      { id: 'first-no-order' },
      { order: 2, id: 'two' },
      { order: 'oops', id: 'nan' },
      { order: 1, id: 'one' },
      { id: 'last-no-order' },
    ]
    expect(sortedByOrder(items).map((i) => i.id)).toEqual([
      'one',
      'two',
      'first-no-order',
      'nan',
      'last-no-order',
    ])
  })

  it('accepts numeric strings and does not mutate the input', () => {
    const items = [{ order: '10', id: 'ten' }, { order: '2', id: 'two' }]
    const sorted = sortedByOrder(items)
    expect(sorted.map((i) => i.id)).toEqual(['two', 'ten'])
    expect(items[0].id).toBe('ten')
    expect(sorted).not.toBe(items)
  })

  it('handles empty and missing arrays', () => {
    expect(sortedByOrder()).toEqual([])
    expect(sortedByOrder([])).toEqual([])
  })
})

describe('sortedAvsnitt', () => {
  it('returns [] for missing or non-array avsnitt', () => {
    expect(sortedAvsnitt()).toEqual([])
    expect(sortedAvsnitt(null)).toEqual([])
    expect(sortedAvsnitt({ avsnitt: 'nope' })).toEqual([])
  })

  it('sorts avsnitt by order', () => {
    const module = {
      avsnitt: [
        { avsnittId: 'a3', order: 3 },
        { avsnittId: 'a1', order: 1 },
        { avsnittId: 'a2', order: 2 },
      ],
    }
    expect(sortedAvsnitt(module).map((a) => a.avsnittId)).toEqual(['a1', 'a2', 'a3'])
  })
})

describe('visibleContentItems', () => {
  it('returns [] when there are no content items', () => {
    expect(visibleContentItems()).toEqual([])
    expect(visibleContentItems({})).toEqual([])
    expect(visibleContentItems({ contentItems: null })).toEqual([])
  })

  it('skips uppgift items and keeps lektion/lasning items in order', () => {
    const avsnitt = {
      contentItems: [
        { contentId: 'u1', type: 'uppgift', title: 'Inlämning' },
        { contentId: 'l2', type: 'lasning', title: 'Text', order: 2 },
        { contentId: 'v1', type: 'lektion', title: 'Film', order: 1 },
      ],
    }
    expect(visibleContentItems(avsnitt).map((i) => i.contentId)).toEqual(['v1', 'l2'])
  })

  it('drops items without a type and non-object entries', () => {
    const avsnitt = {
      contentItems: [null, { title: 'No type' }, { type: 'lektion', title: 'Film' }],
    }
    expect(visibleContentItems(avsnitt)).toEqual([{ type: 'lektion', title: 'Film' }])
  })
})

describe('contentItemLabel', () => {
  it('uses Swedish labels for known types', () => {
    expect(contentItemLabel('lektion')).toBe('Lektion')
    expect(contentItemLabel('lasning')).toBe('Läsning')
    expect(contentItemLabel('uppgift')).toBe('Uppgift')
  })

  it('falls back to the raw type or a generic label', () => {
    expect(contentItemLabel('annat')).toBe('annat')
    expect(contentItemLabel('')).toBe('Innehåll')
    expect(contentItemLabel(null)).toBe('Innehåll')
  })
})

describe('contentMeta', () => {
  it('returns an empty shape for missing or non-object items', () => {
    const empty = { title: '', url: null, linkText: null, durationText: null }
    expect(contentMeta(null)).toEqual(empty)
    expect(contentMeta('lektion')).toEqual(empty)
  })

  it('extracts lektion url and duration', () => {
    expect(contentMeta({
      type: 'lektion',
      title: 'Introduktion',
      lektion: { videoUrl: ' https://example.se/video ', durationMinutes: 12 },
    })).toEqual({
      title: 'Introduktion',
      url: 'https://example.se/video',
      linkText: 'Visa video',
      durationText: '12 min',
    })
  })

  it('handles a lektion without url or duration', () => {
    expect(contentMeta({ type: 'lektion' })).toEqual({
      title: 'Lektion',
      url: null,
      linkText: null,
      durationText: null,
    })
  })

  it('extracts lasning url and estimated minutes', () => {
    expect(contentMeta({
      type: 'lasning',
      title: 'Kapitel 1',
      lasning: { resourceUrl: 'https://example.se/text', estimatedMinutes: 8 },
    })).toEqual({
      title: 'Kapitel 1',
      url: 'https://example.se/text',
      linkText: 'Öppna text',
      durationText: 'ca 8 min',
    })
  })

  it('handles a lasning without url or minutes', () => {
    expect(contentMeta({ type: 'lasning', title: '  ' })).toEqual({
      title: 'Läsning',
      url: null,
      linkText: null,
      durationText: null,
    })
  })

  it('ignores whitespace urls and non-positive minutes', () => {
    expect(contentMeta({
      type: 'lektion',
      title: 'Film',
      lektion: { videoUrl: '   ', durationMinutes: 0 },
    })).toEqual({
      title: 'Film',
      url: null,
      linkText: null,
      durationText: null,
    })
    expect(contentMeta({
      type: 'lasning',
      title: 'Text',
      lasning: { resourceUrl: 'x', estimatedMinutes: -3 },
    }).durationText).toBeNull()
  })

  it('never produces a link for an uppgift item', () => {
    expect(contentMeta({ type: 'uppgift', title: 'Inlämning' })).toEqual({
      title: 'Inlämning',
      url: null,
      linkText: null,
      durationText: null,
    })
  })
})

describe('shouldShowAvsnitt', () => {
  it('is false for missing or hidden modules', () => {
    expect(shouldShowAvsnitt()).toBe(false)
    expect(shouldShowAvsnitt({ isHiddenFromStudent: true, avsnitt: [{ contentItems: [{ type: 'lektion' }] }] })).toBe(false)
  })

  it('is false for empty avsnitt or avsnitt with only uppgift items', () => {
    expect(shouldShowAvsnitt({ avsnitt: [] })).toBe(false)
    expect(shouldShowAvsnitt({
      avsnitt: [{ avsnittId: 'm1-a1', contentItems: [{ type: 'uppgift', title: 'Inlämning' }] }],
    })).toBe(false)
  })

  it('is true when any avsnitt has a lektion or lasning item', () => {
    expect(shouldShowAvsnitt({
      avsnitt: [{ avsnittId: 'm1-a1', contentItems: [{ type: 'lektion', title: 'Film' }] }],
    })).toBe(true)
    expect(shouldShowAvsnitt({
      avsnitt: [{ avsnittId: 'm1-a1', contentItems: [{ type: 'lasning', title: 'Text' }] }],
    })).toBe(true)
  })
})
