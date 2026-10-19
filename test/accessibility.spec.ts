import { expect, test, type Page } from '@playwright/test';

async function openReport(page: Page) {
  await page.route('**/report.docx', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: 'office transfer fixture',
    }),
  );
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(async () => {
    await customElements.whenDefined('r-preview');
    const preview = document.createElement('r-preview');
    preview.textContent = 'Open report';
    preview.setAttribute('baseUrl', `${location.origin}/test/fixtures/editor.html`);
    document.body.append(preview);
    preview.focus();
    preview.setAttribute('src', '/report.docx');
  });
}

test('a keyboard user can open, close and reopen the preview with focus restored', async ({ page }) => {
  await openReport(page);
  const dialog = page.getByRole('dialog', { name: 'File preview' });
  const close = page.getByRole('button', { name: 'Close preview' });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('r-preview')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
});

test('the mobile dialog fits the viewport and has a full close target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReport(page);
  const close = page.getByRole('button', { name: 'Close preview' });
  await expect(close).toBeVisible();
  const rect = await close.boundingBox();
  expect(rect?.width).toBeGreaterThanOrEqual(44);
  expect(rect?.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('iframe')).toHaveAttribute('title', 'Document preview');
  const metrics = await page.locator('.r-preview-mask').evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    viewport: window.innerWidth,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
});
