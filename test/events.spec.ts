import { expect, test } from '@playwright/test';

test('Office renderer completion emits a composed load event to the host page (#7)', async ({ page }) => {
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
    const outer = document.createElement('div');
    document.body.append(outer);
    const preview = document.createElement('r-preview');
    preview.setAttribute('baseUrl', `${location.origin}/test/fixtures/editor.html`);
    outer.attachShadow({ mode: 'closed' }).append(preview);
    (window as any).previewEvents = [];
    document.addEventListener('load', (event) => {
      if (event instanceof CustomEvent) (window as any).previewEvents.push([event.type, event.bubbles, event.composed]);
    });
    preview.setAttribute('src', '/report.docx');
  });
  await expect(page.frameLocator('iframe').locator('body')).toHaveText('report.docx');
  await expect.poll(() => page.evaluate(() => (window as any).previewEvents)).toEqual([['load', true, true]]);
});

test('a failed URL emits one composed error event and dismisses loading (#7)', async ({ page }) => {
  await page.goto('/test/fixtures/preview.html');
  await page.route('**/missing.docx', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.evaluate(async () => {
    await customElements.whenDefined('r-preview');
    const preview = document.createElement('r-preview');
    preview.setAttribute('baseUrl', `${location.origin}/test/fixtures/editor.html`);
    document.body.append(preview);
    (window as any).previewEvents = [];
    document.addEventListener('error', (event) => {
      if (event instanceof CustomEvent) (window as any).previewEvents.push([event.type, event.bubbles, event.composed]);
    });
    preview.setAttribute('src', '/missing.docx');
  });
  await expect.poll(() => page.evaluate(() => (window as any).previewEvents)).toEqual([['error', true, true]]);
  await expect(page.locator('.r-preview-loading')).toHaveCount(0);
});
