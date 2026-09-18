import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const studentState = path.join(AUTH_DIR, 'student.json');
const teacherState = path.join(AUTH_DIR, 'teacher.json');
const adminState = path.join(AUTH_DIR, 'admin.json');

// ── 1. PUBLIC & AUTHENTICATION TESTS ──────────────────────────────────────────
test.describe('Public & Security Features', () => {
  test('Home page renders public layout and navigation brand', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Mindful Learning/i);
    await expect(page.locator('.navbar-brand')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.navbar-brand img.logo, img[alt*="logo" i]').first()).toBeVisible();
  });

  test('Login page renders and handles validation', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#password')).toBeVisible();

    // Invalid login shows an error alert
    await page.fill('#email', 'wrong@mindful.se');
    await page.fill('#password', 'WrongPassword123!');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.error-alert')).toBeVisible({ timeout: 10000 });
  });

  test('Reset password page renders', async ({ page }) => {
    // NOTE: this route does NOT include an email step — the reset form asks
    // for a new password directly (token-based flow via ChangePassword).
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: /Återställ Lösenord/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Återställ lösenord/i })).toBeVisible();
  });

  test('404 Not Found page renders properly for unknown paths', async ({ page }) => {
    await page.goto('/route-does-not-exist-xyz-999');
    await expect(page.locator('text=404')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Sidan hittades inte')).toBeVisible();
  });

  test('Protected route redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/.*login.*/);
  });
});

// ── 2. STUDENT PORTAL TESTS ──────────────────────────────────────────────────
test.describe('Student Portal Features', () => {
  test.use({ storageState: studentState });

  test('Student: Profile / Översikt', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('body')).toContainText('Anna Andersson', { timeout: 15000 });
  });

  test('Student: Course Cards', async ({ page }) => {
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 15000 });
    const card = page.locator('.course-card').first();
    await expect(card).toBeVisible();
  });

  test('Student: Chatbot Study Assistant', async ({ page }) => {
    await page.goto('/chatbot');
    await expect(page.getByRole('heading', { name: /Fråga din studieassistent/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Vanliga frågor/i })).toBeVisible();
  });

  test('Student: Question Bank (Frågebank)', async ({ page }) => {
    await page.goto('/student/fragebank');
    await expect(page.locator('h1, h2, h3, .v-toolbar-title')).toContainText(/Frågebank/i, { timeout: 15000 });
  });

  test('Student: Exam Form', async ({ page }) => {
    await page.goto('/examform');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Student: Messaging', async ({ page }) => {
    await page.goto('/messages');
    await expect(page.locator('h2')).toContainText('Meddelanden', { timeout: 15000 });
  });
});

// ── 3. TEACHER PORTAL TESTS ──────────────────────────────────────────────────
test.describe('Teacher Portal Features', () => {
  test.use({ storageState: teacherState });

  test('Teacher: Staff Profile', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('body')).toContainText('Eva Nahi', { timeout: 15000 });
  });

  test('Teacher: Kurser (Teacher Kurser Page)', async ({ page }) => {
    await page.goto('/larare/kurser');
    await expect(page.getByRole('heading', { name: 'Kurser' })).toBeVisible({ timeout: 15000 });
  });

  test('Teacher: Grade Setting (Betygsättning)', async ({ page }) => {
    await page.goto('/betyg');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Teacher: Grade Signing (Signering)', async ({ page }) => {
    await page.goto('/signering');
    await expect(page.locator('body')).toContainText(/Signering|Betyg/i, { timeout: 15000 });
  });

  test('Teacher: Submissions (Inlämningar)', async ({ page }) => {
    await page.goto('/submissions');
    await expect(page.locator('h2')).toContainText('Inlämningar', { timeout: 15000 });
  });

  test('Teacher: Kalender (Exam Calendar)', async ({ page }) => {
    await page.goto('/kalender');
    await expect(page.locator('.fc, .fullcalendar, .v-calendar, body')).toBeVisible({ timeout: 15000 });
  });

  test('Teacher: Question Bank', async ({ page }) => {
    await page.goto('/larare/fragebank');
    await expect(page.getByRole('heading', { name: 'Frågebank' })).toBeVisible({ timeout: 15000 });
  });

  test('Teacher: Exam Generation', async ({ page }) => {
    await page.goto('/larare/generera-exam');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Teacher: APL Board', async ({ page }) => {
    await page.goto('/apl');
    await expect(page.locator('h1')).toContainText(/APL/i, { timeout: 15000 });
    await expect(page.locator('.column')).toHaveCount(6);
    // Regression: GET /api/uploads/file-counts must not be swallowed by /:studentId
    const res = await page.request.get('/api/uploads/file-counts?studentIds=aa,bb');
    await expect(res.ok()).toBeTruthy();
    await expect((await res.json()).aa).toBe(0);
  });
});

// ── 4. ADMIN PORTAL TESTS ────────────────────────────────────────────────────
test.describe('Admin Portal Features', () => {
  test.use({ storageState: adminState });

  test('Admin: User Search & Management (/anvandare)', async ({ page }) => {
    await page.goto('/anvandare');
    await expect(page.locator('body')).toContainText(/Användare/i, { timeout: 15000 });
  });

  test('Admin: Add User (/lagg-till-anvandare)', async ({ page }) => {
    await page.goto('/lagg-till-anvandare');
    await expect(page.getByRole('heading', { name: /Hantera Användare/i })).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Add Teacher (/lagg-till-larare)', async ({ page }) => {
    await page.goto('/lagg-till-larare');
    await expect(page.getByRole('heading', { name: /Lägg till Lärare/i })).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Permissions Tab (/admin/permissions)', async ({ page }) => {
    await page.goto('/admin/permissions');
    await expect(page.getByRole('heading', { name: /Behörigheter och roller/i })).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Students List & Import (/students)', async ({ page }) => {
    await page.goto('/students');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Manual Add Student (/manual-add-student)', async ({ page }) => {
    await page.goto('/manual-add-student');
    await expect(page.getByRole('heading', { name: /Lägg till elev manuellt/i })).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Education Editor (/education)', async ({ page }) => {
    await page.goto('/education');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Programs and Courses (/programsandcourses)', async ({ page }) => {
    await page.goto('/programsandcourses');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Programs and Packages (/programsandpackages)', async ({ page }) => {
    await page.goto('/programsandpackages');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Course Instances (/course-instances)', async ({ page }) => {
    await page.goto('/course-instances');
    await expect(page.locator('body')).toContainText(/Kursinstans/i, { timeout: 15000 });
  });

  test('Admin: Course Templates (/course-templates)', async ({ page }) => {
    await page.goto('/course-templates');
    await expect(page.locator('body')).toContainText(/Kursmall/i, { timeout: 15000 });
  });

  test('Admin: Course Matching (/course-matching)', async ({ page }) => {
    await page.goto('/course-matching');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Student Enrollments (/student-enrollments)', async ({ page }) => {
    await page.goto('/student-enrollments');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Inactive Students (/inaktiva-elever)', async ({ page }) => {
    await page.goto('/inaktiva-elever');
    await expect(page.locator('body')).toContainText(/Inaktiva/i, { timeout: 15000 });
  });

  test('Admin: Inactivity Report (/admin/inactivity)', async ({ page }) => {
    await page.goto('/admin/inactivity');
    await expect(page.locator('body')).toContainText(/Inaktivitet/i, { timeout: 15000 });
  });

  test('Admin: Reports (/admin/reports)', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Analytics Dashboard (/admin/analytics)', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Course Statistics (/stats/courses)', async ({ page }) => {
    await page.goto('/stats/courses');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Grade Lookups (/grade-lookups)', async ({ page }) => {
    await page.goto('/grade-lookups');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Grading Scales (/admin/betygsskala)', async ({ page }) => {
    await page.goto('/admin/betygsskala');
    await expect(page.locator('body')).toContainText(/Betygsskala/i, { timeout: 15000 });
  });

  test('Admin: Provningar / Exam Management (/provningar)', async ({ page }) => {
    await page.goto('/provningar');
    await expect(page.locator('body')).toContainText(/Prövning/i, { timeout: 15000 });
  });

  test('Admin: Chatbot FAQ Management (/admin/chatbot-faq)', async ({ page }) => {
    await page.goto('/admin/chatbot-faq');
    await expect(page.locator('body')).toContainText(/Vanliga frågor|FAQ/i, { timeout: 15000 });
  });

  test('Admin: Activity Feed Manager (/admin/activity-feed)', async ({ page }) => {
    await page.goto('/admin/activity-feed');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Course Content Editor (/admin/course-content)', async ({ page }) => {
    await page.goto('/admin/course-content');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Student Course Cards Admin (/admin/student-course-cards)', async ({ page }) => {
    await page.goto('/admin/student-course-cards');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Action Plan Manager (/admin/action-plans)', async ({ page }) => {
    await page.goto('/admin/action-plans');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Learning Management (/admin/learning-management)', async ({ page }) => {
    await page.goto('/admin/learning-management');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Notifications Manager (/admin/notifications)', async ({ page }) => {
    await page.goto('/admin/notifications');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Calendar Housekeeping (/admin/calendar-housekeeping)', async ({ page }) => {
    await page.goto('/admin/calendar-housekeeping');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });

  test('Admin: Schedule Parameters (/schedule-parameters)', async ({ page }) => {
    await page.goto('/schedule-parameters');
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  });
});
