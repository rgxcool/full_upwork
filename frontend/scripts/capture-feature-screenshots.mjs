/**
 * Captures one screenshot per verified feature against a real running stack.
 *
 *   node scripts/capture-feature-screenshots.mjs            # all features
 *   node scripts/capture-feature-screenshots.mjs sign-in   # one feature
 *
 * Requires the backend on :5010 and the Vite dev server on :5173.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// Must be exactly `localhost`, not `127.0.0.1`: the API client calls the
// backend directly and the backend's CORS allow-list only names
// http://localhost:5173.
const APP = process.env.APP_URL || 'http://localhost:5173'
const OUT = path.resolve('docs/feature-verification')

const ACCOUNTS = {
    admin: { email: 'admin@mindful.se', password: 'Admin123!' },
    sysadmin: { email: 'sysadmin@mindful.se', password: 'Admin123!' },
    teacher: { email: 'teacher@mindful.se', password: 'Teacher123!' },
    coordinator: { email: 'coordinator@mindful.se', password: 'Teacher123!' },
    syv: { email: 'syv@mindful.se', password: 'Teacher123!' },
    specped: { email: 'specped@mindful.se', password: 'Teacher123!' },
    student: { email: 'student@mindful.se', password: 'Student123!' },
}

/**
 * Each feature gets one screenshot. `path` is relative to the app root; the
 * first student id is resolved at runtime for the student-detail features.
 */
const FEATURES = [
    { id: 'sign-in', role: null, path: '/login' },
    { id: 'dashboard', role: 'admin', path: '/dashboard' },
    { id: 'user-management', role: 'admin', path: '/admin/users' },
    { id: 'permissions', role: 'admin', path: '/admin/permissions' },
    { id: 'add-teacher', role: 'admin', path: '/lagg-till-larare' },
    { id: 'students', role: 'admin', path: '/students' },
    { id: 'add-student', role: 'admin', path: '/addstudent' },
    { id: 'inactive-students', role: 'admin', path: '/inaktiva-elever' },
    { id: 'student-detail', role: 'admin', path: '/student', resolve: 'firstStudentId' },
    { id: 'education-catalog', role: 'admin', path: '/programsandcourses' },
    { id: 'programs-packages', role: 'admin', path: '/programsandpackages' },
    { id: 'course-instances', role: 'admin', path: '/course-instances' },
    { id: 'course-templates', role: 'admin', path: '/course-templates' },
    { id: 'course-matching', role: 'admin', path: '/course-matching' },
    { id: 'enrollments', role: 'admin', path: '/student-enrollments' },
    { id: 'grading', role: 'teacher', path: '/betyg' },
    { id: 'grade-lookups', role: 'admin', path: '/grade-lookups' },
    { id: 'grade-reports', role: 'admin', path: '/admin/betygsrapporter' },
    { id: 'grade-scale', role: 'admin', path: '/admin/betygsskala' },
    { id: 'signing', role: 'teacher', path: '/signering' },
    { id: 'exam-form', role: 'admin', path: '/examform' },
    { id: 'question-bank', role: 'teacher', path: '/larare/fragebank' },
    { id: 'generate-exam', role: 'teacher', path: '/larare/generera-exam' },
    { id: 'exams', role: 'teacher', path: '/provningar' },
    { id: 'calendar', role: 'admin', path: '/kalender' },
    { id: 'syv-appointments', role: 'syv', path: '/syv/appointments' },
    { id: 'specped-appointments', role: 'specped', path: '/specped/appointments' },
    { id: 'course-stats', role: 'admin', path: '/stats/courses' },
    { id: 'analytics', role: 'admin', path: '/admin/analytics' },
    { id: 'reports', role: 'admin', path: '/admin/reports' },
    { id: 'activity-feed', role: 'admin', path: '/admin/activity-feed' },
    { id: 'schedule-parameters', role: 'admin', path: '/schedule-parameters' },
    { id: 'certificates', role: 'admin', path: '/admin/certificates' },
    { id: 'completions', role: 'admin', path: '/admin/completions' },
    { id: 'faq-management', role: 'admin', path: '/admin/chatbot-faq' },
    { id: 'apl', role: 'admin', path: '/apl' },
    { id: 'chatbot', role: 'teacher', path: '/chatbot' },
    { id: 'messages', role: 'admin', path: '/messages' },
    { id: 'earnings', role: 'admin', path: '/earnings' },
    { id: 'profile', role: 'admin', path: '/profile' },
]

const log = (...a) => console.log(...a)

/** Signs in through the real login form so the cookie is set exactly as for a user. */
async function signIn(page, role) {
    const account = ACCOUNTS[role]
    if (!account) return
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle' })
    await page.fill('#email', account.email)
    await page.fill('#password', account.password)
    await Promise.all([
        page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 }),
        page.click('button[type=submit]'),
    ])
}

/** Looks up a real student id so /student/:id renders an actual record. */
async function firstStudentId(page) {
    // Absolute URL: the page may still be on about:blank at this point.
    return page.evaluate(async (origin) => {
        const res = await fetch(`${origin}/api/students?limit=1`, { credentials: 'include' })
        const body = await res.json()
        // The endpoint returns a bare array today, but tolerate the usual
        // envelopes so this keeps working if that changes.
        const rows = Array.isArray(body)
            ? body
            : body?.data?.students ?? body?.students ?? body?.data ?? []
        return rows[0]?._id ?? rows[0]?.id ?? null
    }, APP)
}

async function main() {
    const only = process.argv.slice(2)
    const features = only.length
        ? FEATURES.filter((f) => only.includes(f.id))
        : FEATURES
    if (!features.length) {
        console.error(`No feature matched. Known ids: ${FEATURES.map((f) => f.id).join(', ')}`)
        process.exit(1)
    }

    await mkdir(OUT, { recursive: true })
    const browser = await chromium.launch()
    const results = []

    /**
     * One browser context per role, reused across that role's features. A fresh
     * context per feature would drop the auth cookie and silently capture the
     * sign-in page instead of the feature.
     */
    const contexts = new Map()
    const contextFor = async (role) => {
        if (!role) {
            if (!contexts.has('anon')) {
                contexts.set('anon', await browser.newContext({
                    viewport: { width: 1440, height: 960 },
                    locale: 'sv-SE',
                }))
            }
            return contexts.get('anon')
        }
        if (!contexts.has(role)) {
            const context = await browser.newContext({
                viewport: { width: 1440, height: 960 },
                locale: 'sv-SE',
            })
            const page = await context.newPage()
            await signIn(page, role)
            await page.close()
            contexts.set(role, context)
        }
        return contexts.get(role)
    }

    try {
        for (const feature of features) {
            const label = feature.id
            const consoleErrors = []
            let page
            let target = feature.path
            let status = 'ok'
            let note = ''
            let summary = null

            try {
                const context = await contextFor(feature.role)
                page = await context.newPage()
                page.on('console', (m) => {
                    if (m.type() === 'error') consoleErrors.push(m.text())
                })
                page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

                if (feature.resolve === 'firstStudentId') {
                    // Land on the app origin first so the in-page fetch works.
                    await page.goto(APP, { waitUntil: 'domcontentloaded' })
                    const id = await firstStudentId(page)
                    if (!id) throw new Error('no student found to open')
                    target = `${feature.path}/${id}`
                }
                await page.goto(`${APP}${target}`, { waitUntil: 'networkidle', timeout: 30000 })
                await page.waitForTimeout(1200)

                // Guard: a lost session silently produces a screenshot of the
                // sign-in page that looks superficially fine. Only meaningful
                // for features that are supposed to be authenticated.
                if (feature.role && page.url().includes('/login')) {
                    throw new Error('redirected to /login — session was not applied')
                }

                // A screenshot is only evidence if the page behind it has real
                // content, so record what actually rendered. Used by the report
                // and to catch pages that only look fine.
                const summary = await page.evaluate(() => {
                    const main = document.querySelector('main, .v-main, #app') || document.body
                    const text = (main.innerText || '')
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    return {
                        title: document.title,
                        heading: text.find((t) => t.length > 2 && t.length < 80) ?? null,
                        lineCount: text.length,
                        excerpt: text.slice(0, 8),
                    }
                })
                if (summary.lineCount < 3) {
                    throw new Error(`page looks empty (${summary.lineCount} text lines)`)
                }
                await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true })
            } catch (err) {
                status = 'failed'
                note = err.message.split('\n')[0]
                if (page) {
                    await page
                        .screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true })
                        .catch(() => {})
                }
            } finally {
                if (page) await page.close()
            }

            results.push({
                id: label,
                role: feature.role,
                path: target,
                status,
                note,
                consoleErrors: consoleErrors.length,
            })
            log(`${status === 'ok' ? '✓' : '✗'} ${label.padEnd(24)} ${target} ${note}`)
        }
    } finally {
        for (const context of contexts.values()) await context.close()
        await browser.close()
    }

    const failed = results.filter((r) => r.status !== 'ok')
    log(`\n${results.length - failed.length}/${results.length} captured -> ${OUT}`)
    if (failed.length) {
        log(`failed: ${failed.map((f) => f.id).join(', ')}`)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
