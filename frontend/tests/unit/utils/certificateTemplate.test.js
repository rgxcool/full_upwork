import { describe, expect, it } from 'vitest'
import { renderTemplate, SAMPLE_CERTIFICATE_DATA } from '@/utils/certificateTemplate.js'

describe('certificateTemplate.renderTemplate', () => {
    it('substitutes simple placeholders', () => {
        const out = renderTemplate('<p>{{studentName}} – {{courseName}}</p>', {
            studentName: 'Anna',
            courseName: 'Engelska',
        })
        expect(out).toBe('<p>Anna – Engelska</p>')
    })

    it('renders flag sections when truthy and hides them when falsy', () => {
        const tpl = '{{#showGrade}}G{{/showGrade}}|{{^showApl}}N/A{{/showApl}}'
        expect(renderTemplate(tpl, { showGrade: true, showApl: false })).toBe('G|N/A')
        expect(renderTemplate(tpl, { showGrade: false, showApl: true })).toBe('|')
    })

    it('honours explicitly passed section overrides', () => {
        const tpl = '{{#showGrade}}G{{/showGrade}}'
        expect(renderTemplate(tpl, {}, { showGrade: true })).toBe('G')
        expect(renderTemplate(tpl, {}, { showGrade: false })).toBe('')
    })

    it('renders null/undefined as empty string', () => {
        expect(renderTemplate('{{a}}{{b}}', { a: null, b: undefined })).toBe('')
    })

    it('renders a full sample diploma document', () => {
        const html = '<html><body>{{studentName}} {{courseCode}} {{grade}}</body></html>'
        const out = renderTemplate(html, SAMPLE_CERTIFICATE_DATA, { showGrade: true })
        expect(out).toContain('Anna Elevsson')
        expect(out).toContain('ENGENG05')
    })

    it('strips leftover v-if markers', () => {
        const out = renderTemplate('<br v-if="x" /><p>ok</p>')
        expect(out).toBe('<br /><p>ok</p>')
    })
})
