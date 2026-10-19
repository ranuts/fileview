import { expect, test } from '@playwright/test';

async function reopenFirst(page: import('@playwright/test').Page) {
  await page.route('**/*.docx', (route) =>
    route.fulfill({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: 'Office stacking fixture',
    }),
  );
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(() => customElements.whenDefined('r-preview'));
  return page.evaluate(async () => {
    for (const name of ['first', 'second']) {
      const preview = document.createElement('r-preview') as HTMLElement & {
        src: string;
        baseUrl: string;
      };
      preview.id = name;
      preview.baseUrl = `${location.origin}/test/fixtures/modern-editor.html`;
      document.body.append(preview);
      const loaded = new Promise((resolve) => preview.addEventListener('load', resolve, { once: true }));
      preview.src = `/${name}.docx`;
      await loaded;
    }
    const firstDialog = document.querySelector('.r-preview-mask')!.id;
    const first = document.querySelector('#first') as HTMLElement & { showPreview(): void };
    const loaded = new Promise((resolve) => first.addEventListener('load', resolve, { once: true }));
    first.showPreview();
    await loaded;
    return firstDialog;
  });
}

test('reopening an earlier instance brings its dialog above the later dialog', async ({ page }) => {
  const firstDialog = await reopenFirst(page);
  const topDialog = await page.evaluate(
    () => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.r-preview-mask')?.id,
  );
  expect(topDialog).toBe(firstDialog);
});

test('Escape dismisses only one dialog after reopening an earlier instance', async ({ page }) => {
  await reopenFirst(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.r-preview-mask:visible')).toHaveCount(1);
});
