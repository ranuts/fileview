import { expect, test } from '@playwright/test';

test('own registration returns one constructor whose instances expose the preview API', async ({ page }) => {
  await page.goto('/test/fixtures/modern-editor.html');
  const result = await page.evaluate(async () => {
    const entry = '/manual.ts';
    const manual: typeof import('../manual') = await import(entry);
    const [first, second] = await Promise.all([
      manual.registerPreview('typed-file-preview'),
      manual.registerPreview('typed-file-preview'),
    ]);
    if (!manual.isPreviewConstructor(first)) throw new Error('Missing typed preview constructor');
    const element = new first();
    element.src = '/sample.pdf';
    element.baseUrl = 'https://example.com';
    element.readonly = true;
    element.closeable = 'false';
    element.showPreview();
    element.closePreview(false);
    return {
      same: first === second,
      registered: first === customElements.get('typed-file-preview'),
      src: element.src,
      baseUrl: element.baseUrl,
      readonly: element.readonly,
      closeable: element.closeable,
      defaultRegistered: Boolean(customElements.get('r-preview')),
    };
  });
  expect(result).toEqual({
    same: true,
    registered: true,
    src: '/sample.pdf',
    baseUrl: 'https://example.com',
    readonly: true,
    closeable: 'false',
    defaultRegistered: false,
  });
});

test('an unrelated existing custom tag keeps its constructor and cannot acquire preview types', async ({ page }) => {
  await page.goto('/test/fixtures/modern-editor.html');
  const result = await page.evaluate(async () => {
    const entry = '/manual.ts';
    const manual: typeof import('../manual') = await import(entry);
    class ForeignElement extends HTMLElement {}
    customElements.define('foreign-file-preview', ForeignElement);
    const existing = await manual.registerPreview('foreign-file-preview');
    await manual.registerPreview('own-file-preview');
    return {
      preserved: existing === ForeignElement,
      typedAsPreview: manual.isPreviewConstructor(existing),
      undefinedIsPreview: manual.isPreviewConstructor(undefined),
      registered: customElements.get('foreign-file-preview') === ForeignElement,
    };
  });
  expect(result).toEqual({ preserved: true, typedAsPreview: false, undefinedIsPreview: false, registered: true });
});
