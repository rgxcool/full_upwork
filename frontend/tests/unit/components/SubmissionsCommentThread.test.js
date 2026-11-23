import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SubmissionsCommentThread from '@/components/SubmissionsCommentThread.vue'

describe('SubmissionsCommentThread.vue', () => {
    it('renders comments and their timestamps', () => {
        const wrapper = mount(SubmissionsCommentThread, {
            props: {
                comments: [
                    {
                        id: 'comment-1',
                        at: '2026-01-15T12:30:00.000Z',
                        text: 'Bra arbete',
                    },
                ],
            },
        })

        expect(wrapper.text()).toContain('Bra arbete')
        expect(wrapper.find('.ct-meta').text()).not.toBe('')
    })

    it('opens the reply form and emits a trimmed reply on Enter', async () => {
        const wrapper = mount(SubmissionsCommentThread, {
            props: { comments: [{ id: 'comment-1', text: 'Förslag' }] },
        })

        await wrapper.find('.ct-reply-btn').trigger('click')
        const input = wrapper.find('.ct-reply-input')
        await input.setValue('  Jag håller med  ')
        await input.trigger('keyup.enter')

        expect(wrapper.emitted('reply')).toEqual([
            [{ parentCommentId: 'comment-1', text: 'Jag håller med' }],
        ])
        expect(wrapper.find('.ct-reply-form').exists()).toBe(false)
    })

    it('does not submit an empty reply and clears the draft on cancel', async () => {
        const wrapper = mount(SubmissionsCommentThread, {
            props: { comments: [{ id: 'comment-1', text: 'Förslag' }] },
        })

        await wrapper.find('.ct-reply-btn').trigger('click')
        const input = wrapper.find('.ct-reply-input')
        await input.setValue('   ')
        await wrapper.find('.save-btn').trigger('click')
        expect(wrapper.emitted('reply')).toBeUndefined()

        await input.setValue('draft')
        await wrapper.find('.ct-cancel-btn').trigger('click')
        expect(wrapper.find('.ct-reply-form').exists()).toBe(false)
    })

    it('forwards replies emitted by a nested thread', async () => {
        const wrapper = mount(SubmissionsCommentThread, {
            props: {
                comments: [{
                    id: 'parent',
                    text: 'Parent',
                    children: [{ id: 'child', text: 'Child' }],
                }],
            },
        })

        await wrapper.findAll('.ct-reply-btn')[1].trigger('click')
        await wrapper.find('.ct-reply-input').setValue('Reply to child')
        await wrapper.find('.ct-reply-input').trigger('keyup.enter')

        expect(wrapper.emitted('reply')).toEqual([
            [{ parentCommentId: 'child', text: 'Reply to child' }],
        ])
    })
})
