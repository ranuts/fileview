import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const pdf = await readFile(new URL('./fixtures/pdf-two-pages.pdf', import.meta.url));

test('demo releases replaced file URLs but keeps the active file available for reopening', async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      const value = create(blob);
      active.add(value);
      return value;
    };
    URL.revokeObjectURL = (value) => {
      active.delete(value);
      revoke(value);
    };
    (window as any).activeDemoUrls = active;
  });
  await page.goto('/');
  await page.evaluate(() => customElements.whenDefined('r-preview'));
  for (const name of ['first.pdf', 'second.pdf']) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Choose a file/ }).click();
    await (await chooser).setFiles({ name, mimeType: 'application/pdf', buffer: pdf });
    await expect(page.locator('canvas')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => (window as any).activeDemoUrls.size)).toBe(1);
    await page.getByRole('button', { name: 'Close preview' }).click();
    expect(await page.evaluate(() => (window as any).activeDemoUrls.size)).toBe(1);
  }
  const result = await page.evaluate(async () => {
    const preview = document.querySelector('r-preview')!;
    const selected = preview.getAttribute('src')!;
    const hostOwned = URL.createObjectURL(new Blob(['host file'], { type: 'application/pdf' }));
    preview.removeAttribute('src');
    await Promise.resolve();
    const retained = (window as any).activeDemoUrls.has(hostOwned);
    let released = false;
    try {
      await fetch(selected);
    } catch {
      released = true;
    }
    URL.revokeObjectURL(hostOwned);
    return { retained, released };
  });
  expect(result).toEqual({ retained: true, released: true });
});
