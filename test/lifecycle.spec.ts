import { expect, test } from '@playwright/test';

const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function setup(page: import('@playwright/test').Page) {
  await page.route('**/*.docx', async (route) => {
    if (route.request().url().includes('slow')) await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ contentType: mime, body: 'Office lifecycle fixture' });
  });
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(() => customElements.whenDefined('r-preview'));
}

test('initial source creates exactly one dialog and reports modern read-only completion', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const preview = document.createElement('r-preview');
    preview.setAttribute('baseUrl', `${location.origin}/test/fixtures/modern-editor.html`);
    preview.setAttribute('readonly', '');
    preview.setAttribute('src', '/report.docx');
    (window as any).events = [];
    preview.addEventListener('load', () => (window as any).events.push('load'));
    document.body.append(preview);
  });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('report.docx:true');
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
});

test('idle instances create no remote iframe and removal removes only their own dialog', async ({ page }) => {
  await setup(page);
  await page.evaluate(() =>
    document.body.append(document.createElement('r-preview'), document.createElement('r-preview')),
  );
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('r-preview')!.remove());
  await expect(page.locator('r-preview')).toHaveCount(1);
  await expect(page.locator('.r-preview-mask')).toHaveCount(0);
});

test('replacing a source cancels stale completion and close can reopen safely', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const preview = document.createElement('r-preview');
    preview.textContent = 'Open document';
    preview.setAttribute('baseUrl', `${location.origin}/test/fixtures/modern-editor.html`);
    document.body.append(preview);
    (window as any).events = [];
    preview.addEventListener('load', () => (window as any).events.push('load'));
    preview.addEventListener('error', () => (window as any).events.push('error'));
    preview.setAttribute('src', '/slow.docx');
    preview.setAttribute('src', '/latest.docx');
  });
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('latest.docx:false');
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.locator('r-preview').click();
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('latest.docx:false');
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load', 'load']);
});

test('two simultaneous Office previews remain independent when one closes', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    for (const name of ['first', 'second']) {
      const preview = document.createElement('r-preview');
      preview.id = name;
      preview.setAttribute('baseUrl', `${location.origin}/test/fixtures/modern-editor.html`);
      document.body.append(preview);
      preview.setAttribute('src', `/${name}.docx`);
    }
  });
  await expect(page.locator('iframe')).toHaveCount(2);
  await expect(page.frameLocator('iframe').nth(0).locator('body')).toHaveText('first.docx:false');
  await expect(page.frameLocator('iframe').nth(1).locator('body')).toHaveText('second.docx:false');
  await page.evaluate(() => document.getElementById('first')!.remove());
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('second.docx:false');
});
