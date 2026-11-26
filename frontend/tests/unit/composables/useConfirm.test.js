import { describe, it, expect } from 'vitest'
import { useConfirm } from '@/composables/useConfirm.js'

describe('useConfirm', () => {
  it('resolves true when confirmed', async () => {
    const { confirm, state, settle } = useConfirm()
    const p = confirm({ title: 'Ta bort?', danger: true })
    expect(state.open).toBe(true)
    expect(state.danger).toBe(true)
    settle(true)
    await expect(p).resolves.toBe(true)
    expect(state.open).toBe(false)
  })

  it('resolves false when cancelled', async () => {
    const { confirm, settle } = useConfirm()
    const p = confirm('Vill du fortsätta?')
    settle(false)
    await expect(p).resolves.toBe(false)
  })

  it('cancels the first dialog when a second one opens', async () => {
    const { confirm, settle } = useConfirm()
    const first = confirm('A')
    const second = confirm('B')
    await expect(first).resolves.toBe(false)
    settle(true)
    await expect(second).resolves.toBe(true)
  })
})
