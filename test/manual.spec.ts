import { expect, test } from '@playwright/test';

test('manual entry stays passive until explicit custom-name registration (#1)', async ({ page }) => {
  await page.goto('/test/fixtures/modern-editor.html');
  await page.evaluate(async () => {
    const entry = '/manual.ts';
    const manual = await import(entry);
    (window as any).autoRegistered = Boolean(customElements.get('r-preview'));
    await manual.registerPreview('app-file-preview');
    const element = document.createElement('app-file-preview');
    element.textContent = 'Custom preview';
    document.body.append(element);
  });
  expect(await page.evaluate(() => (window as any).autoRegistered)).toBe(false);
  await expect(page.getByRole('button', { name: 'Custom preview' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});
