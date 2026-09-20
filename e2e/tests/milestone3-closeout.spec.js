import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// M3 close-out pass — E2E through the real UI for the three newest features:
//
//   * Item 67 — Question bank → create question (QuestionBank.vue) + generate
//     an exam from selected questions (ExamGeneration.vue), routed at
//     /larare/fragebank and /larare/generera-exam.
//   * Item 59 — Threaded discussion on assignment submissions
//     (Submissions.vue + SubmissionsCommentThread.vue): teacher posts a
//     comment, then replies to it (parentCommentId).
//   * Item 58 — Student kurskort shows the "current module" chip
//     (CourseCards.vue, computed in enrollmentService.buildCourseCards).
//
// Seeded accounts (backend/scripts/seedE2EData.js): admin@mindful.se /
// Admin123!, teacher@mindful.se / Teacher123! ("Eva Nahi"), student@mindful.se
// / Student123! ("Anna Andersson"). Anna is active in SVASVE01 (teacher Eva),
// module 1 has an assignment. Auth state is cached in ../.auth so no new
// logins happen (per-IP rate limit respected).
//
// Preconditions: backend up on :5010 (current code), vite dev server on :5173,
// seeded e2e DB. Serial (workers:1) so the student submission precedes the
// teacher comment tests.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const adminState = path.join(AUTH_DIR, 'admin.json');
const teacherState = path.join(AUTH_DIR, 'teacher.json');
const studentState = path.join(AUTH_DIR, 'student.json');

const UNIQUE = `E2E-${Date.now()}`;

test.describe.serial('Item 67 — question bank → exam generation (admin)', () => {
  test.use({ storageState: adminState });

  test('admin creates two questions and generates an exam from them', async ({ page }) => {
    // Keep the question text under the 40-char preview truncation limit so the
    // row matcher can use the full string (ExamGeneration truncates at 40).
    const text1 = `Fråga 1 (${UNIQUE})`;
    const text2 = `Fråga 2 (${UNIQUE})`;

    // --- QuestionBank: create question 1 ---
    await page.goto('/larare/fragebank');
    await expect(page.locator('.card-header h3')).toHaveText('Frågebank', { timeout: 20000 });
    await page.getByRole('button', { name: 'Ny fråga' }).click();
    const modal = page.locator('.modal-card');
    await expect(modal).toBeVisible();

    await modal.locator('.v-text-field input').first().fill(text1);
    await modal.locator('.v-select').first().click();
    await page
      .locator('.v-list-item')
      .filter({ hasText: 'Svenska som andraspråk 1' })
      .last()
      .click();
    await modal.getByLabel('Alternativ (komma separerade)').fill('2024, 2025, 2026, 2027');
    await modal.getByLabel('Rät svar').fill('2026');
    const created1 = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/question-bank'),
      { timeout: 15000 }
    );
    await modal.locator('.v-card-title button', { hasText: 'Spara' }).click();
    await created1;
    await expect(page.locator('table tbody tr', { hasText: text1 })).toBeVisible({ timeout: 15000 });

    // --- QuestionBank: create question 2 ---
    await page.getByRole('button', { name: 'Ny fråga' }).click();
    await expect(modal).toBeVisible();
    await modal.locator('.v-text-field input').first().fill(text2);
    await modal.locator('.v-select').first().click();
    await page
      .locator('.v-list-item')
      .filter({ hasText: 'Svenska som andraspråk 1' })
      .last()
      .click();
    await modal.getByLabel('Alternativ (komma separerade)').fill('1000, 2000, 3000, 4000');
    await modal.getByLabel('Rät svar').fill('2000');
    const created2 = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/question-bank'),
      { timeout: 15000 }
    );
    await modal.locator('.v-card-title button', { hasText: 'Spara' }).click();
    await created2;
    await expect(page.locator('table tbody tr', { hasText: text2 })).toBeVisible({ timeout: 15000 });

    // --- ExamGeneration: select course, pick both, generate, save ---
    await page.goto('/larare/generera-exam');
    await expect(page.locator('.card-header h3').first()).toHaveText('Generera exam', { timeout: 20000 });

    await page.locator('.exam-generation-page .v-select').first().click();
    const questionsLoaded = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes('/api/question-bank/by-course'),
      { timeout: 15000 }
    );
    await page
      .locator('.v-list-item')
      .filter({ hasText: 'Svenska som andraspråk 1' })
      .last()
      .click();
    await questionsLoaded;
    await expect(page.locator('table tbody tr', { hasText: text1 })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('table tbody tr', { hasText: text2 })).toBeVisible();

    const row1 = page.locator('table tbody tr').filter({ hasText: text1 });
    const row2 = page.locator('table tbody tr').filter({ hasText: text2 });
    // Vuetify hides the real input; clicking .v-checkbox does not toggle here,
    // so check the native input directly.
    await row1.locator('.v-checkbox input').check({ force: true });
    await row2.locator('.v-checkbox input').check({ force: true });

    const settings = page.locator('.card').filter({ has: page.getByText('Exam-inställningar') });
    await settings.locator('.v-text-field input').first().fill(`E2E Genererad Exam ${UNIQUE}`);

    await expect(page.getByRole('button', { name: /Generera exam med 2 frågor/ })).toBeEnabled();
    const gen = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/question-bank/generate-exam'),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: /Generera exam med 2 frågor/ }).click();
    await gen;

    const preview = page.locator('.card').filter({ has: page.getByText('Generated exam preview') });
    await expect(preview).toBeVisible({ timeout: 15000 });
    await expect(preview).toContainText(text1);

    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        r.url().includes('/api/question-bank/exam-attempts/') &&
        r.url().includes('/questions'),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Spara exam' }).click();
    await saved;
    await expect(preview).toBeHidden({ timeout: 10000 });

    // --- Confirm the attempt was persisted with our title ---
    const res = await page.request.get('/api/question-bank/exam-attempts');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(
      body.examAttempts.some((a) => a.title === `E2E Genererad Exam ${UNIQUE}` && a.selectedCount === 2)
    ).toBeTruthy();
  });
});

test.describe.serial('Item 59 — threaded submission comments (teacher)', () => {
  const commentText = `Kommentar från E2E ${UNIQUE}`;
  const replyText = `Svar på kommentar E2E ${UNIQUE}`;

  test.describe.serial('student submit', () => {
    test.use({ storageState: studentState });

    test('submits the module-1 assignment so a submission exists', async ({ page }) => {
      await page.goto('/course-cards');
      await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });
      const card = page.locator('.course-card').filter({ hasText: 'SVASVE01' }).first();
      await expect(card).toBeVisible();

      const moduleDetail = card.locator('details.module-details').first();
      await moduleDetail.locator('summary').click();
      await expect(moduleDetail.locator('.submission-textarea')).toBeVisible({ timeout: 10000 });
      await moduleDetail
        .locator('.submission-textarea')
        .fill(`E2E inlämning för trådtest ${UNIQUE}`);
      const posted = page
        .waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().includes('/api/learning/submissions'),
          { timeout: 15000 }
        )
        .catch(() => null);
      await moduleDetail.locator('.submit-btn').click();
      if (posted) await posted;
      await expect(moduleDetail.locator('.submission-status')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe.serial('teacher comments', () => {
    test.use({ storageState: teacherState });

    test('posts a comment and replies to it (nested thread)', async ({ page }) => {
      await page.goto('/submissions');
      await expect(page.locator('.page-header h2')).toHaveText('Inlämningar', { timeout: 20000 });

      const annaCard = page
        .locator('.submission-card')
        .filter({ hasText: 'Anna Andersson' })
        .filter({ hasText: 'SVASVE01' })
        .first();
      await expect(annaCard).toBeVisible({ timeout: 15000 });

      // Post a fresh comment on Anna's submission — idempotent across runs
      // (older E2E comments may already exist in the thread).
      await annaCard.locator('.comment-input').fill(commentText);
      const post1 = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes('/api/learning/submissions/') &&
          r.url().includes('/comments'),
        { timeout: 15000 }
      );
      await annaCard.locator('.comment-thread-form button').click();
      await post1;

      const thread = annaCard.locator('.comment-thread');
      await expect(thread).toBeVisible({ timeout: 15000 });
      await expect(thread.locator('.thread-title')).toHaveText('Kommentarer');

      const myComment = thread.locator('.ct-comment').filter({ hasText: commentText }).first();
      await expect(myComment).toBeVisible();
      await myComment.locator('.ct-reply-btn').click();
      await expect(myComment.locator('.ct-reply-input')).toBeVisible();
      await myComment.locator('.ct-reply-input').fill(replyText);

      const postReply = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes('/api/learning/submissions/') &&
          r.url().includes('/comments'),
        { timeout: 15000 }
      );
      await myComment.locator('.save-btn-sm', { hasText: 'Skicka' }).click();
      await postReply;

      // Reply renders NESTED (inside .ct-children) under our parent comment.
      const nestedReply = thread
        .locator('.ct-children .ct-comment')
        .filter({ hasText: replyText })
        .first();
      await expect(nestedReply).toBeVisible({ timeout: 15000 });
    });
  });
});

test.describe.serial('Item 58 — student kurskort current module', () => {
  test.use({ storageState: studentState });

  test('SVASVE01 card shows an in-progress current module', async ({ page }) => {
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });
    const card = page.locator('.course-card').filter({ hasText: 'SVASVE01' }).first();
    await expect(card).toBeVisible();

    const currentModule = card.locator('.current-module');
    await expect(currentModule).toBeVisible({ timeout: 10000 });
    await expect(currentModule.locator('.module-status')).toHaveText('Pågår');
    const title = await currentModule.locator('strong').innerText();
    expect(title.trim().length).toBeGreaterThan(0);

    // Module list still renders under the card.
    await expect(card.locator('.course-card-modules')).toBeVisible();
  });
});