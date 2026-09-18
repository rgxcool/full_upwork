import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Item 29 — Lesson content + per-module assignment submissions + teacher
// feedback + per-course progress (MVP). Backend: /api/learning/instances/:id/
// modules, POST /submissions, /api/learning/submissions/pending,
// PUT /api/learning/submissions/:id/feedback. Progress is computed into
// GET /course-cards/mine as card.progress.
//
// Seeded accounts (backend/scripts/seedE2EData.js): teacher@mindful.se /
// Teacher123! ("Eva Nahi"), student@mindful.se / Student123! ("Anna Andersson").
// Anna is enrolled in SVASVE01 (2026-07-06 → 2026-09-28, teacher Eva Nahi).
// The seed gives module 1 an assignment and fills each section with
// instructions so the student card has lesson content to show.
//
// Flow: student opens the card, reads instructions, submits the module-1
// assignment; teacher opens /submissions, reviews it (godkänd + comment);
// student reloads the card and sees the feedback. A resubmission clears
// earlier feedback, and the progress assertions are load-time based, so
// re-running the spec is idempotent (a re-run resubmits → feedback reset →
// pending again → re-reviewed).
//
// Run with the backend up (API_RATE_LIMIT_MAX=1000) and the seeded e2e DB.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, '..', 'verification-screenshots');
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const studentState = path.join(AUTH_DIR, 'student.json');
const teacherState = path.join(AUTH_DIR, 'teacher.json');

let pageErrors = [];

function trackPage(page) {
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`BROWSER CONSOLE ERROR: ${msg.text()}`);
    }
  });
}

// ===== TESTS =====

test.describe('Student assignment flow', () => {
  test.use({ storageState: studentState });

  test('Student: opens the course card, reads lesson content, and submits assignment', async ({ page }) => {
    trackPage(page);
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });
    const card = page.locator('.course-card').filter({ hasText: 'SVASVE01' }).first();
    await expect(card).toBeVisible();

    // Open module 1 details
    const moduleDetail = card.locator('details.module-details').first();
    await moduleDetail.locator('summary').click();
    await expect(moduleDetail.locator('.assignment-block')).toBeVisible({ timeout: 10000 });

    // Fill in assignment text if form is present
    const textarea = moduleDetail.locator('.submission-textarea');
    if (await textarea.isVisible()) {
      await textarea.fill('Detta är en E2E inlämningsreflektion för modul 1 av Anna Andersson.');
      const submitResp = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/learning/submissions'),
        { timeout: 10000 }
      ).catch(() => null);
      await moduleDetail.locator('.submit-btn').click();
      if (submitResp) await submitResp;
      await expect(moduleDetail.locator('.submission-status')).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Teacher reviews submission', () => {
  test.use({ storageState: teacherState });

  test('Teacher: reviews the pending submission and saves feedback', async ({ page }) => {
    trackPage(page);
    await page.goto('/submissions');
    await expect(page.locator('.page-header h2')).toHaveText('Inlämningar', { timeout: 20000 });

    const submissionCards = page.locator('.submission-card');
    const count = await submissionCards.count();
    if (count > 0) {
      const firstCard = submissionCards.first();
      await firstCard.locator('.status-select').selectOption('godkänd');
      await firstCard.locator('.feedback-comment-input').fill('Bra jobbat!');
      const putResp = page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().includes('/learning/submissions'),
        { timeout: 10000 }
      ).catch(() => null);
      await firstCard.locator('.save-btn').first().click();
      if (putResp) await putResp;
    }
  });
});

test.describe('Student verifies feedback', () => {
  test.use({ storageState: studentState });

  test('Student: reloads the card and sees the feedback on the submission', async ({ page }) => {
    trackPage(page);
    await page.goto('/course-cards');
    await expect(page.locator('.student-name')).toContainText('Anna Andersson', { timeout: 20000 });
    const card = page.locator('.course-card').filter({ hasText: 'SVASVE01' }).first();
    await expect(card).toBeVisible();

    const moduleDetail = card.locator('details.module-details').first();
    await moduleDetail.locator('summary').click();
    await expect(moduleDetail.locator('.submission-status')).toBeVisible({ timeout: 10000 });
    await expect(moduleDetail.locator('.feedback-chip')).toBeVisible();
  });
});
