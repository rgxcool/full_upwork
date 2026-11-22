/**
 * Pure helpers for Avsnitt + content items (Slice 2 – read-only display).
 * Does not touch progress / currentModule semantics.
 */

const TYPE_LABELS = {
  lektion: 'Lektion',
  lasning: 'Läsning',
  uppgift: 'Uppgift',
}

/**
 * Sort by `order` ascending; fall back to original array index when order is missing/NaN.
 */
export function sortedByOrder(items = []) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = Number(a.item?.order)
      const bo = Number(b.item?.order)
      const aValid = Number.isFinite(ao)
      const bValid = Number.isFinite(bo)
      if (aValid && bValid) return ao - bo || a.index - b.index
      if (aValid) return -1
      if (bValid) return 1
      return a.index - b.index
    })
    .map(({ item }) => item)
}

/**
 * Return Avsnitt sorted by order. Empty / missing → [].
 */
export function sortedAvsnitt(module) {
  if (!module || !Array.isArray(module.avsnitt)) return []
  return sortedByOrder(module.avsnitt)
}

/**
 * Content items that should appear in the read-only list.
 * Uppgift items are skipped (interactive assignment block stays the single source).
 */
export function visibleContentItems(avsnitt) {
  if (!avsnitt || !Array.isArray(avsnitt.contentItems)) return []
  return sortedByOrder(avsnitt.contentItems).filter(
    (item) => item && item.type && item.type !== 'uppgift'
  )
}

/**
 * Swedish label for a content-item type.
 */
export function contentItemLabel(type) {
  return TYPE_LABELS[type] || type || 'Innehåll'
}

/**
 * Safe meta for display: title, optional URL + link text, optional duration text.
 * Never throws on missing fields.
 */
export function contentMeta(item) {
  if (!item || typeof item !== 'object') {
    return { title: '', url: null, linkText: null, durationText: null }
  }

  const title = (item.title || '').trim() || contentItemLabel(item.type)
  let url = null
  let linkText = null
  let durationText = null

  if (item.type === 'lektion') {
    const lektion = item.lektion || {}
    url = (lektion.videoUrl || '').trim() || null
    if (url) linkText = 'Visa video'
    const mins = Number(lektion.durationMinutes)
    if (Number.isFinite(mins) && mins > 0) {
      durationText = `${mins} min`
    }
  } else if (item.type === 'lasning') {
    const lasning = item.lasning || {}
    url = (lasning.resourceUrl || '').trim() || null
    if (url) linkText = 'Öppna text'
    const mins = Number(lasning.estimatedMinutes)
    if (Number.isFinite(mins) && mins > 0) {
      durationText = `ca ${mins} min`
    }
  }

  return { title, url, linkText, durationText }
}

/**
 * Whether the module should show the Avsnitt block at all.
 * Hidden modules and modules with no visible non-uppgift content stay silent.
 */
export function shouldShowAvsnitt(module) {
  if (!module || module.isHiddenFromStudent) return false
  const avsnitt = sortedAvsnitt(module)
  if (avsnitt.length === 0) return false
  return avsnitt.some((a) => visibleContentItems(a).length > 0)
}
