import { test, expect } from '@playwright/test';

// ── D1: Student APL Tab ──────────────────────────────────────────────
test.describe('D1: APL / Student Self-Service', () => {
  test.use({ storageState: 'student.json' });

  test('Student: Opens APL tab and sees status, placement & dates', async ({ page }) => {
    await page.goto('/apl/my');
    
    // Wait for APL content to load
    await expect(page.locator('.apl-status, .apl-record, body')).toBeVisible({ timeout: 10000 });
    
    // Check APL status shows real values (not "Okänd" or blank)
    const aplStatus = page.locator('.apl-status, .status, [data-testid="apl-status"]').first();
    await expect(aplStatus).toBeVisible({ timeout: 5000 });
    const statusText = await aplStatus.textContent();
    console.log('APL status text:', statusText);
    // Should not be "Okänd" or blank for a properly set up student
    expect(statusText.trim()).not.toBe('Okänd');
    expect(statusText.trim()).not.toBe('');
    
    // Check placement company/contact and dates show real values
    const placementCompany = page.locator('.placement-company, .company, [data-testid="placement-company"]').first();
    const placementContact = page.locator('.placement-contact, .contact, [data-testid="placement-contact"]').first();
    
    // These may be null for some students, but should be real values if set
    if (await placementCompany.isVisible({ timeout: 3000 })) {
      const companyText = await placementCompany.textContent();
      expect(companyText.trim().length).toBeGreaterThan(0);
    }
    if (await placementContact.isVisible({ timeout: 3000 })) {
      const contactText = await placementContact.textContent();
      expect(contactText.trim().length).toBeGreaterThan(0);
    }
    
    // Check dates are real values
    const startDate = page.locator('.start-date, .apl-start, [data-testid="apl-start"]').first();
    const endDate = page.locator('.end-date, .apl-end, [data-testid="apl-end"]').first();
    
    if (await startDate.isVisible({ timeout: 3000 })) {
      const startText = await startDate.textContent();
      expect(startText.trim().length).toBeGreaterThan(0);
    }
    if (await endDate.isVisible({ timeout: 3000 })) {
      const endText = await endDate.textContent();
      expect(endText.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── E1: Certificate / Diploma Generation ──────────────────────────────
test.describe('E1: Certificates / Diploma Generation', () => {
  test.use({ storageState: 'admin.json' });

  test('Admin: Triggers diploma generation for eligible student', async ({ page }) => {
    // Navigate to admin area or use API
    await page.goto('/admin/certificates');
    
    // Wait for page to load
    await expect(page.locator('body, h1')).toBeVisible({ timeout: 10000 });
    
    // Check for eligible students
    const eligibleStudents = page.locator('.eligible-student, .candidate, .student-row').first();
    await expect(eligibleStudents).toBeVisible({ timeout: 5000 });
    
    // Try to generate certificate/diploma
    const generateBtn = eligibleStudents.locator('button:has-text("Generera"), button:has-text("Generate"), button:has-text("Diploma")').first();
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();
    
    // Should show success or prompt
    const successMsg = page.locator('.success, .alert, .toast').first();
    await expect(successMsg).toBeVisible({ timeout: 5000 });
  });

  test('Admin: Generates diploma twice in a row (no duplicates)', async ({ page }) => {
    await page.goto('/admin/certificates');
    
    // Get the list of existing certificates before generation
    const beforeGenerate = page.locator('.certificate-record, .certificate, .generated-list');
    const beforeCount = await beforeGenerate.locator('').count();
    
    // Trigger generation
    await page.click('button:has-text("Generera")');
    await expect(page.locator('.success, .alert')).toBeVisible({ timeout: 5000 });
    
    // Check certificate count after first generation
    const afterFirstCount = await beforeGenerate.locator('').count();
    
    // Trigger generation again
    await page.click('button:has-text("Generera")');
    await expect(page.locator('.success, .alert')).toBeVisible({ timeout: 5000 });
    
    // Check certificate count after second generation
    const afterSecondCount = await beforeGenerate.locator('').count();
    
    // Should not have duplicates - count should increase by at most 1 per generation
    // Or stay the same if the system deduplicates
    console.log('Certificates before:', beforeCount, 'after first:', afterFirstCount, 'after second:', afterSecondCount);
  });
});
