import { expect, test, type Page } from '@playwright/test';

const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function setup(page: Page, query = '', readonly = false) {
  await page.route('**/*.docx', (route) => route.fulfill({ contentType: mime, body: 'Office transfer' }));
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(
    async ({ query, readonly }) => {
      await customElements.whenDefined('r-preview');
      const preview = document.createElement('r-preview');
      preview.id = 'preview';
      preview.setAttribute('baseurl', `${location.origin}/test/fixtures/hardening-editor.html${query}`);
      if (readonly) preview.setAttribute('readonly', '');
      (window as any).events = [];
      for (const type of ['load', 'error']) preview.addEventListener(type, () => (window as any).events.push(type));
      document.body.append(preview);
      preview.setAttribute('src', '/report.docx');
    },
    { query, readonly },
  );
}

// Reloading the iframe or fetching again destroys these unsaved edits.
test('closeable changes retain the active editor and unsaved content', async ({ page }) => {
  let fetches = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/report.docx')) fetches++;
  });
  await setup(page);
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('report.docx');
  await input.fill('Unsaved edit');
  await page.getByRole('button', { name: 'Close preview' }).focus();
  await page.evaluate(() => {
    (window as any).originalIframe = document.querySelector('iframe');
    document.querySelector('#preview')!.setAttribute('closeable', 'false');
  });
  await expect(page.getByRole('button', { name: 'Close preview' })).toHaveCount(0);
  await expect(input).toHaveValue('Unsaved edit');
  expect(await page.evaluate(() => document.querySelector('iframe') === (window as any).originalIframe)).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('dialog');
  await page.evaluate(() => document.querySelector('#preview')!.removeAttribute('closeable'));
  await expect(page.getByRole('button', { name: 'Close preview' })).toHaveCount(1);
  expect(fetches).toBe(1);
});

test('readonly commands serialize rapid toggles and retain unsaved document state', async ({ page }) => {
  await setup(page, '?commandDelay=80');
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('report.docx');
  await input.fill('Keep this edit');
  await page.evaluate(() => {
    const preview = document.querySelector('#preview')!;
    for (const value of ['', 'false', '']) preview.setAttribute('readonly', value);
  });
  await expect(input).toHaveAttribute('readonly', '');
  await expect(input).toHaveValue('Keep this edit');
  const frame = page.frames().find((frame) => frame.url().includes('hardening-editor'))!;
  await expect.poll(() => frame.evaluate(() => (window as any).commands)).toEqual([true, false, true]);
  expect(await frame.evaluate(() => (window as any).opens)).toBe(1);
  expect(await frame.evaluate(() => (window as any).state.dirty)).toBe(true);
  expect(await page.evaluate(() => (window as any).events)).toEqual(['load']);
});

test('readonly command errors preserve the existing editor and allow subsequent requests', async ({ page }) => {
  await setup(page, '?reject');
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('report.docx');
  await input.fill('Do not discard');
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('readonly', ''));
  await expect(page.getByRole('alert')).toContainText('Mode change rejected');
  await expect(input).toHaveValue('Do not discard');
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('readonly', 'false'));
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load', 'error', 'error']);
  await expect(input).toHaveValue('Do not discard');
});

for (const readonly of [false, true]) {
  test(`modern readiness retries a delayed state response (${readonly ? 'readonly' : 'editable'})`, async ({
    page,
  }) => {
    await setup(page, '?readyDelay=900&probeOnly', readonly);
    await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
    await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
  });
}

test('ordinary HTTP crypto without randomUUID opens independent Office dialogs', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  await setup(page);
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await page.evaluate(() => {
    const preview = document.querySelector('#preview')!.cloneNode() as HTMLElement;
    preview.id = 'second';
    document.body.append(preview);
  });
  await expect(page.locator('iframe')).toHaveCount(2);
  await expect(page.frameLocator('iframe').nth(1).getByRole('textbox')).toHaveValue('report.docx');
  expect(
    await page.locator('[role="dialog"]').evaluateAll((dialogs) => new Set(dialogs.map((dialog) => dialog.id)).size),
  ).toBe(2);
});

test('legacy encoding stops reading as soon as a chunk read is aborted', async ({ page }) => {
  await page.goto('/test/fixtures/preview.html');
  const result = await page.evaluate(async () => {
    const modulePath = '/components/preview/office.ts';
    const { renderOffice } = await import(modulePath);
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const controller = new AbortController();
    const file = new File([new Uint8Array(128 * 16384)], 'abort.docx');
    let reads = 0;
    const slice = file.slice.bind(file);
    file.slice = (start, end) => {
      reads++;
      const chunk = slice(start, end);
      const read = chunk.arrayBuffer.bind(chunk);
      chunk.arrayBuffer = async () => {
        controller.abort(new DOMException('Cancelled chunk', 'AbortError'));
        return read();
      };
      return chunk;
    };
    try {
      await renderOffice(file, {
        iframe,
        url: new URL('/test/fixtures/hardening-legacy.html', location.href),
        readonly: false,
        signal: controller.signal,
      });
      return { reads, aborted: false };
    } catch (error) {
      return { reads, aborted: (error as Error).name === 'AbortError' };
    }
  });
  expect(result).toEqual({ reads: 1, aborted: true });
});

test('legacy transfer reads only the next acknowledged chunk and preserves the wire file', async ({ page }) => {
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(async () => {
    const modulePath = '/components/preview/office.ts';
    const { renderOffice } = await import(modulePath);
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const bytes = new Uint8Array(32770);
    bytes[0] = 0;
    bytes[1] = 128;
    bytes[16383] = 255;
    bytes[16384] = 200;
    bytes[32769] = 254;
    const file = new File([bytes], 'binary.docx', { type: 'application/octet-stream', lastModified: 123456789 });
    (window as any).reads = 0;
    const slice = file.slice.bind(file);
    file.slice = (start, end) => {
      (window as any).reads++;
      return slice(start, end);
    };
    (window as any).transfer = renderOffice(file, {
      iframe,
      url: new URL('/test/fixtures/hardening-legacy.html?pause', location.href),
      readonly: false,
      signal: new AbortController().signal,
    });
  });
  const frame = () => page.frames().find((frame) => frame.url().includes('hardening-legacy'))!;
  await expect.poll(async () => frame()?.evaluate(() => (window as any).chunks.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).reads)).toBe(1);
  for (const count of [2, 3]) {
    await frame().evaluate(() => (window as any).releaseChunk());
    await expect.poll(() => frame().evaluate(() => (window as any).chunks.length)).toBe(count);
    expect(await page.evaluate(() => (window as any).reads)).toBe(count);
  }
  await frame().evaluate(() => (window as any).releaseChunk());
  await page.evaluate(() => (window as any).transfer);
  const received = await frame().evaluate(() => (window as any).received);
  expect({ ...received, bytes: undefined }).toEqual({
    name: 'binary.docx',
    type: 'application/octet-stream',
    lastModified: 123456789,
    bytes: undefined,
  });
  expect(received.bytes.length).toBe(32770);
  expect([0, 1, 16383, 16384, 32769].map((index) => received.bytes[index])).toEqual([0, 128, 255, 200, 254]);
});

test('readonly enabled during readiness keeps waiting for the modern editor', async ({ page }) => {
  await setup(page, '?readyDelay=2200&probeOnly');
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('Original');
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('readonly', ''));
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('report.docx');
  await expect(input).toHaveAttribute('readonly', '');
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
});

test('label and PDF mode changes retain an Office document and unsaved edits', async ({ page }) => {
  await setup(page);
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('report.docx');
  await input.fill('Mode-independent edit');
  await page.evaluate(() => {
    (window as any).originalIframe = document.querySelector('iframe');
    const preview = document.querySelector('#preview')!;
    preview.setAttribute('label', 'New accessible name');
    preview.setAttribute('pdf-mode', 'virtual');
    (preview as any).pdfMode = 'eager';
  });
  await expect(page.locator('#preview')).toHaveAccessibleName('New accessible name');
  await expect(input).toHaveValue('Mode-independent edit');
  expect(await page.evaluate(() => document.querySelector('iframe') === (window as any).originalIframe)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('#preview')!.getAttribute('pdf-mode'))).toBe('eager');
});

test('PDF mode selects virtual rendering, keeps closeable changes local, and reloads to eager explicitly', async ({
  page,
}) => {
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(async () => {
    await customElements.whenDefined('r-preview');
    const preview = document.createElement('r-preview');
    preview.id = 'preview';
    (window as any).events = [];
    preview.addEventListener('load', () => (window as any).events.push('load'));
    preview.setAttribute('pdf-mode', 'virtual');
    document.body.append(preview);
    preview.setAttribute('src', '/test/fixtures/pdf-thirty-pages.pdf');
  });
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
  await expect(page.locator('[data-pdf-page]')).toHaveCount(30);
  expect(await page.locator('canvas').count()).toBeLessThan(30);
  await page.evaluate(() => {
    (window as any).firstCanvas = document.querySelector('canvas');
    document.querySelector('#preview')!.setAttribute('closeable', 'false');
  });
  expect(await page.evaluate(() => document.querySelector('canvas') === (window as any).firstCanvas)).toBe(true);
  expect(await page.evaluate(() => (window as any).events)).toEqual(['load']);
  await page.evaluate(() => ((document.querySelector('#preview') as any).pdfMode = 'eager'));
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load', 'load']);
  await expect(page.locator('canvas')).toHaveCount(30);
  await expect(page.locator('[data-pdf-page]')).toHaveCount(0);
});

test('readonly responses require the correlated id, renderer source, and exact origin', async ({ page }) => {
  await setup(page, '?commandDelay=800');
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await page.evaluate(() => {
    const preview = document.querySelector('#preview')!;
    preview.setAttribute('readonly', '');
    preview.setAttribute('readonly', 'false');
  });
  const frame = page.frames().find((frame) => frame.url().includes('hardening-editor'))!;
  await expect.poll(() => frame.evaluate(() => (window as any).commands.length)).toBe(1);
  await page.evaluate(async () => {
    const target = document.querySelector('iframe')!.contentWindow!;
    const id = (target as any).pendingId;
    for (const [source, origin, responseId] of [
      [window, location.origin, id],
      [target, 'https://wrong-origin.invalid', id],
      [target, location.origin, 'wrong-id'],
    ]) {
      dispatchEvent(
        new MessageEvent('message', {
          source,
          origin,
          data: { id: responseId, type: 'document:readonly-changed', payload: { readonly: true } },
        }),
      );
    }
    // Give an incorrectly accepted reply time to start the queued command.
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  expect(await frame.evaluate(() => (window as any).commands)).toEqual([true]);
  await expect.poll(() => frame.evaluate(() => (window as any).commands)).toEqual([true, false]);
  await expect(page.frameLocator('iframe').getByRole('textbox')).not.toHaveAttribute('readonly');
});

test('closing or replacing a document cancels pending mode changes without stale errors', async ({ page }) => {
  await setup(page, '?commandDelay=800');
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await page.evaluate(() => {
    const preview = document.querySelector('#preview')!;
    preview.setAttribute('readonly', '');
    preview.setAttribute('readonly', 'false');
  });
  const frame = page.frames().find((frame) => frame.url().includes('hardening-editor'))!;
  await expect.poll(() => frame.evaluate(() => (window as any).commands.length)).toBe(1);
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('src', '/replacement.docx'));
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('replacement.docx');
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load', 'load']);
  await page.evaluate(() => {
    document.querySelector('#preview')!.setAttribute('readonly', '');
  });
  const replacement = page.frames().find((frame) => frame.url().includes('hardening-editor'))!;
  await expect.poll(() => replacement.evaluate(() => (window as any).commands.length)).toBe(1);
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).events)).toEqual(['load', 'load']);
});

test('a legacy readonly change reports unsupported mode without destroying unsaved edits', async ({ page }) => {
  await setup(page);
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await page.evaluate(() =>
    document
      .querySelector('#preview')!
      .setAttribute('baseurl', `${location.origin}/test/fixtures/hardening-legacy.html`),
  );
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('report.docx');
  await input.fill('Unsaved legacy edit');
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('readonly', ''));
  await expect(page.getByRole('alert')).toContainText('requires a renderer with the document embed API');
  await expect(input).toHaveValue('Unsaved legacy edit');
});

test('reconnecting an opened preview restores a working close button', async ({ page }) => {
  await setup(page);
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await page.evaluate(() => {
    const preview = document.querySelector('#preview')!;
    preview.remove();
    document.body.append(preview);
  });
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await page.getByRole('button', { name: 'Close preview' }).click({ timeout: 3000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('readonly toggles during delayed open settle to the latest requested mode', async ({ page }) => {
  await setup(page, '?readyDelay=900&probeOnly&openDelay=800');
  const input = page.frameLocator('iframe').getByRole('textbox');
  await expect(input).toHaveValue('Original');
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('readonly', ''));
  await expect(input).toHaveAttribute('readonly', '');
  await page.evaluate(() => document.querySelector('#preview')!.setAttribute('readonly', 'false'));
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
  await expect(input).not.toHaveAttribute('readonly');
});

test('editable modern readiness remains active while a legacy probe is unacknowledged', async ({ page }) => {
  await setup(page, '?readyDelay=2200&probeOnly');
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('report.docx');
  await expect.poll(() => page.evaluate(() => (window as any).events)).toEqual(['load']);
  const frame = page.frames().find((frame) => frame.url().includes('hardening-editor'))!;
  expect(await frame.evaluate(() => (window as any).opens)).toBe(1);
});

test('readonly enabled during the first legacy ACK stops before reading another chunk', async ({ page }) => {
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(async () => {
    const modulePath = '/components/preview/office.ts';
    const { renderOffice } = await import(modulePath);
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const file = new File([new Uint8Array(32770)], 'readonly.docx');
    const slice = file.slice.bind(file);
    (window as any).reads = 0;
    file.slice = (start, end) => {
      (window as any).reads++;
      return slice(start, end);
    };
    const options = {
      iframe,
      url: new URL('/test/fixtures/hardening-legacy.html?pause', location.href),
      readonly: false,
      signal: new AbortController().signal,
    };
    (window as any).enableReadonly = () => (options.readonly = true);
    (window as any).transfer = renderOffice(file, options).then(
      () => 'opened',
      (error: Error) => error.message,
    );
  });
  const frame = () => page.frames().find((frame) => frame.url().includes('hardening-legacy'))!;
  await expect.poll(async () => frame()?.evaluate(() => (window as any).chunks.length)).toBe(1);
  await page.evaluate(() => (window as any).enableReadonly());
  await frame().evaluate(() => (window as any).releaseChunk());
  expect(await page.evaluate(() => (window as any).transfer)).toContain(
    'requires a renderer with the document embed API',
  );
  expect(await page.evaluate(() => (window as any).reads)).toBe(1);
  expect(await frame().evaluate(() => (window as any).chunks.length)).toBe(1);
});

test('readonly enabled during the first legacy read prevents its first send', async ({ page }) => {
  await page.goto('/test/fixtures/preview.html');
  const result = await page.evaluate(async () => {
    const modulePath = '/components/preview/office.ts';
    const { renderOffice } = await import(modulePath);
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const options = {
      iframe,
      url: new URL('/test/fixtures/hardening-legacy.html', location.href),
      readonly: false,
      signal: new AbortController().signal,
    };
    const file = new File(['12345678'], 'first-read.docx');
    const slice = file.slice.bind(file);
    file.slice = (start, end) => {
      const chunk = slice(start, end);
      const read = chunk.arrayBuffer.bind(chunk);
      chunk.arrayBuffer = async () => {
        const result = await read();
        options.readonly = true;
        return result;
      };
      return chunk;
    };
    const outcome = await renderOffice(file, options).then(
      () => 'opened',
      (error: Error) => error.message,
    );
    return { outcome, sent: (iframe.contentWindow as any).chunks.length };
  });
  expect(result.sent).toBe(0);
  expect(result.outcome).toContain('requires a renderer with the document embed API');
});

for (const size of [8, 32770]) {
  test(`readonly enabled during the final legacy ACK rejects the ${size === 8 ? 'single' : 'multiple'} chunk transfer`, async ({
    page,
  }) => {
    await page.goto('/test/fixtures/preview.html');
    await page.evaluate(async (size) => {
      const modulePath = '/components/preview/office.ts';
      const { renderOffice } = await import(modulePath);
      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      const options = {
        iframe,
        url: new URL('/test/fixtures/hardening-legacy.html?pause', location.href),
        readonly: false,
        signal: new AbortController().signal,
      };
      (window as any).enableReadonly = () => (options.readonly = true);
      (window as any).transfer = renderOffice(new File([new Uint8Array(size)], 'last-ack.docx'), options).then(
        () => 'opened',
        (error: Error) => error.message,
      );
    }, size);
    const frame = () => page.frames().find((frame) => frame.url().includes('hardening-legacy'))!;
    const count = size === 8 ? 1 : 3;
    await expect.poll(async () => frame()?.evaluate(() => (window as any).chunks.length)).toBe(1);
    for (let expected = 2; expected <= count; expected++) {
      await frame().evaluate(() => (window as any).releaseChunk());
      await expect.poll(() => frame().evaluate(() => (window as any).chunks.length)).toBe(expected);
    }
    await page.evaluate(() => (window as any).enableReadonly());
    await frame().evaluate(() => (window as any).releaseChunk());
    expect(await page.evaluate(() => (window as any).transfer)).toContain(
      'requires a renderer with the document embed API',
    );
  });
}

test('repeated iframe load events leave no readiness probes after cancellation', async ({ page }) => {
  await page.goto('/test/fixtures/preview.html');
  await page.evaluate(async () => {
    const modulePath = '/components/preview/office.ts';
    const { renderOffice } = await import(modulePath);
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const controller = new AbortController();
    (window as any).cancelOffice = () => controller.abort();
    (window as any).transfer = renderOffice(new File(['12345678'], 'cancel.docx'), {
      iframe,
      url: new URL('/test/fixtures/hardening-editor.html?readyDelay=90000&probeOnly', location.href),
      readonly: false,
      signal: controller.signal,
    }).catch(() => 'aborted');
  });
  const frame = () => page.frames().find((frame) => frame.url().includes('hardening-editor'))!;
  await expect(page.frameLocator('iframe').getByRole('textbox')).toHaveValue('Original');
  await frame().evaluate(() => {
    (window as any).probes = 0;
    addEventListener('message', (event) => {
      if (event.data?.type === 'document:get-state') (window as any).probes++;
    });
  });
  await page.evaluate(() => {
    const iframe = document.querySelector('iframe')!;
    iframe.dispatchEvent(new Event('load'));
    iframe.dispatchEvent(new Event('load'));
    (window as any).cancelOffice();
  });
  expect(await page.evaluate(() => (window as any).transfer)).toBe('aborted');
  const before = await frame().evaluate(() => (window as any).probes);
  // Observe more than two retry periods, so an orphaned interval cannot hide.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 600)));
  expect(await frame().evaluate(() => (window as any).probes)).toBe(before);
});
