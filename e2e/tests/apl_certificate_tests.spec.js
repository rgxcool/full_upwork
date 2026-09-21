import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '..', '.auth');
const studentState = path.join(AUTH_DIR, 'student.json');
const adminState = path.join(AUTH_DIR, 'admin.json');

// ── D1: Student APL Self-Service ─────────────────────────────────────
test.describe('D1: APL / Student Self-Service', () => {
  test.use({ storageState: studentState });

  test('Student: sees APL status, placement & dates on dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // APL panel renders the real GET /apl/my data.
    const panel = page.locator('.panel.today-panel', { hasText: 'APL-status' });
    await expect(panel).toBeVisible({ timeout: 10000 });

    const pill = panel.locator('.status-pill');
    await expect(pill).toBeVisible();
    const label = (await pill.textContent()).trim();
    // A seeded student must have a real status label, never "Okänd" / blank.
    expect(label).toBeTruthy();
    expect(label).not.toBe('Okänd');
    expect(label).not.toBe('');

    // The student's own APL record via API returns placement + dates.
    const res = await page.request.get('/api/apl/my');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
    // Placement/date fields may be absent for some students, but the status
    // field must always carry a concrete stored/default value.
    const allowed = ['GRAY', 'BLUE', 'YELLOW', 'PURPLE', 'RED', 'GREEN'];
    expect(allowed).toContain(body.status);
  });
});

// ── E1: Certificates / Diploma Generation ─────────────────────────────
test.describe('E1: Certificates / Diploma Generation', () => {
  test.use({ storageState: adminState });

  test('Admin: opens Intyg & Diplom config and sees eligible candidate', async ({ page }) => {
    await page.goto('/admin/certificates');
    await expect(page.locator('.scrollable-view')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h1, .text-h5').first()).toContainText('Intyg', { timeout: 10000 });

    // Admin config section: signature, logo, signer name/title must be present.
    await expect(page.locator('.v-tab', { hasText: 'Inställningar' })).toBeVisible();
    const settingsTab = page.locator('.v-tab[value="settings"], .v-tab >> text=Inställningar').first();
    if (await settingsTab.isVisible()) settingsTab.click();

    await expect(page.locator('text=Underskrift').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Logotyp').first()).toBeVisible();
    await expect(page.locator('text=Signerare').first()).toBeVisible();

    // Candidate queue is reachable; the seeded Doris Dahl (completed SVA,
    // grade C) must be eligible for a study certificate.
    await page.locator('.v-tab', { hasText: 'Godkänn & generera' }).click();
    await expect(page.locator('text=Kö för godkännande').first()).toBeVisible({ timeout: 5000 });
    const candidateRow = page.locator('tr', { hasText: 'Doris Dahl' }).first();
    await expect(candidateRow).toBeVisible({ timeout: 10000 });
    await expect(candidateRow).toContainText('Berättigad', { timeout: 5000 });
  });

  test('Admin: generate twice in a row produces no duplicate certificate', async ({ page }) => {
    // Drive the generation via the API (same pipeline the UI calls) to verify
    // the server-side dedupe: a second generate must reuse the certificate
    // number instead of issuing a new one.
    const candidates = await page.request.get('/api/certificates/candidates?type=studieintyg&limit=20');
    expect(candidates.status()).toBe(200);
    const { candidates: list } = await candidates.json();
    const doris = list.find((c) => c.studentName === 'Doris Dahl');
    expect(doris).toBeTruthy();

    let record = doris.record;
    if (!record) {
      const createRes = await page.request.post('/api/certificates', {
        data: { type: 'studieintyg', enrollmentId: doris.enrollmentId },
      });
      expect(createRes.status()).toBe(201);
      record = await createRes.json();
    }
    if (record.status === 'draft' || !record.status) {
      await page.request.post(`/api/certificates/${record._id}/approve`);
    }

    const first = await (await page.request.post(`/api/certificates/${record._id}/generate`)).json();
    expect(first.status).toBe('generated');
    expect(first.certificateNumber).toBeTruthy();

    const second = await (await page.request.post(`/api/certificates/${record._id}/generate`)).json();
    expect(second.certificateNumber).toBe(first.certificateNumber);
  });
});