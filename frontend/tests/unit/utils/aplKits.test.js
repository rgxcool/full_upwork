import { describe, it, expect } from 'vitest'
import {
    LOGBOOK_ROLES,
    canManageAplKits,
    hasLogbookEntries,
    isStaffProfile,
    isAplManagedStudent,
    shouldShowLogbookTab,
} from '@/utils/aplKits.js'

const student = (overrides = {}) => ({
    _id: 'stu-1',
    name: 'Anna Elev',
    education: [],
    aplStatus: 'GRAY',
    aplStatusHistory: [],
    logbook: [],
    dropout: false,
    ...overrides,
})

describe('APL kit visibility helpers', () => {
    it('allows only the roles the logbook API permits', () => {
        expect(LOGBOOK_ROLES).toEqual(['admin', 'systemadmin', 'teacher'])
        expect(canManageAplKits('admin')).toBe(true)
        expect(canManageAplKits('systemadmin')).toBe(true)
        expect(canManageAplKits('teacher')).toBe(true)
        expect(canManageAplKits('coordinator')).toBe(false)
        expect(canManageAplKits('syv')).toBe(false)
        expect(canManageAplKits('student')).toBe(false)
    })

    it('detects students with logbook kits', () => {
        expect(hasLogbookEntries(student({ logbook: [{ id: 'k1' }] }))).toBe(true)
        expect(hasLogbookEntries(student())).toBe(false)
        expect(hasLogbookEntries(null)).toBe(false)
    })

    it('treats staff profiles as non-students', () => {
        expect(isStaffProfile({ role: 'teacher' })).toBe(true)
        expect(isStaffProfile({ userRole: 'Admin' })).toBe(true)
        expect(isStaffProfile({ role: 'student' })).toBe(false)
        expect(isStaffProfile(null)).toBe(false)
    })

    describe('isAplManagedStudent', () => {
        it('recognises a CoursePackage education entry', () => {
            expect(
                isAplManagedStudent(
                    student({ education: [{ type: 'CoursePackage', name: 'APL' }] })
                )
            ).toBe(true)
        })

        it('recognises a manually added APL student', () => {
            const ids = new Set(['stu-1'])
            expect(isAplManagedStudent(student(), ids)).toBe(true)
            expect(isAplManagedStudent(student({ _id: 'other' }), ids)).toBe(false)
        })

        it('recognises APL history and an active non-GRAY status', () => {
            expect(
                isAplManagedStudent(
                    student({ aplStatusHistory: [{ status: 'BLUE' }] })
                )
            ).toBe(true)
            expect(isAplManagedStudent(student({ aplStatus: 'YELLOW' }))).toBe(true)
        })

        it('does not treat a dropped-out student as active', () => {
            expect(
                isAplManagedStudent(student({ aplStatus: 'YELLOW', dropout: true }))
            ).toBe(false)
        })

        it('returns false for a student with no APL indicators', () => {
            expect(isAplManagedStudent(student())).toBe(false)
            expect(isAplManagedStudent(null)).toBe(false)
        })
    })

    describe('shouldShowLogbookTab', () => {
        it('shows the tab to an allowed role even before the first kit exists', () => {
            expect(
                shouldShowLogbookTab({
                    student: student({ education: [{ type: 'CoursePackage' }] }),
                    role: 'teacher',
                })
            ).toBe(true)
        })

        it('shows the tab when kits already exist', () => {
            expect(
                shouldShowLogbookTab({
                    student: student({ logbook: [{ id: 'k1' }] }),
                    role: 'admin',
                })
            ).toBe(true)
        })

        it('hides the tab from roles the API rejects, even with kits', () => {
            const aplStudent = student({ logbook: [{ id: 'k1' }] })
            expect(shouldShowLogbookTab({ student: aplStudent, role: 'syv' })).toBe(false)
            expect(shouldShowLogbookTab({ student: aplStudent, role: 'coordinator' })).toBe(
                false
            )
            expect(shouldShowLogbookTab({ student: aplStudent, role: 'student' })).toBe(false)
        })

        it('hides the tab for staff profiles', () => {
            expect(
                shouldShowLogbookTab({
                    student: student({ role: 'teacher', logbook: [{ id: 'k1' }] }),
                    role: 'admin',
                })
            ).toBe(false)
        })

        it('hides the tab for a student with no APL connection and no kits', () => {
            expect(shouldShowLogbookTab({ student: student(), role: 'teacher' })).toBe(false)
            expect(shouldShowLogbookTab({ student: null, role: 'teacher' })).toBe(false)
        })
    })
})
