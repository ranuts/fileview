import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';

/** Exercise only files extracted from the tarball, at a URL distinct from the host page. */
export async function verifyBrowserPackage(installed, root) {
  const distribution = resolve(installed, 'dist');
  const contentTypes = {
    '.js': 'text/javascript',
    '.cjs': 'text/javascript',
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/harness/entry.html') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><title>Installed package consumer</title></head><body></body></html>');
        return;
      }
      let file;
      if (pathname === '/sample.pdf') file = resolve(root, 'test/fixtures/pdf-two-pages.pdf');
      else if (pathname === '/long.pdf') file = resolve(root, 'test/fixtures/pdf-thirty-pages.pdf');
      else if (pathname.startsWith('/package/')) {
        file = resolve(distribution, decodeURIComponent(pathname.slice('/package/'.length)));
        if (!file.startsWith(`${distribution}${sep}`)) throw new Error('Invalid package path');
      } else {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch();
    for (const entry of ['manual', 'esm', 'umd']) {
      const page = await browser.newPage();
      const failures = [];
      const fonts = [];
      page.on('pageerror', (error) => failures.push(error.message));
      page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('response', (response) => {
        if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
        if (response.url().includes('/standard_fonts/')) fonts.push(response.status());
      });
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(`${origin}/`) || url.startsWith('blob:')) return route.continue();
        failures.push(`Unexpected external request ${url}`);
        return route.abort();
      });
      await page.goto(`${origin}/harness/entry.html`);
      if (entry === 'umd') {
        await page.addScriptTag({ url: `${origin}/package/umd/index.umd.cjs` });
        assert.equal(await page.evaluate(() => typeof window.ranui?.preview?.registerPreview), 'function');
        await page.evaluate(() => window.ranui.preview.default);
      } else {
        await page.evaluate(async (kind) => {
          const library = await import(`/package/${kind === 'manual' ? 'manual' : 'index'}.js`);
          if (kind === 'manual') {
            if (customElements.get('r-preview') || document.querySelector('style[data-fileview]')) {
              throw new Error('Manual entry performed registration during import');
            }
            await library.registerPreview();
          } else await library.preview.default;
        }, entry);
      }
      const pixels = await page.evaluate(async () => {
        const preview = document.createElement('r-preview');
        const completed = new Promise((accept, reject) => {
          preview.addEventListener('load', accept, { once: true });
          preview.addEventListener('error', (event) => reject(new Error(String(event.detail))), { once: true });
        });
        preview.setAttribute('src', '/sample.pdf');
        document.body.append(preview);
        await Promise.race([
          completed,
          new Promise((_, reject) => setTimeout(() => reject(new Error('PDF preview timed out')), 15000)),
        ]);
        return Array.from(document.querySelectorAll('canvas'), (canvas) =>
          Array.from(canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data),
        );
      });
      assert.deepEqual(
        pixels,
        [
          [255, 0, 0, 255],
          [0, 0, 255, 255],
        ],
        `${entry}: both PDF pages must be painted`,
      );
      assert(fonts.length > 0 && fonts.every((status) => status === 200), `${entry}: bundled standard fonts must load`);
      await page.evaluate(async () => {
        const preview = document.querySelector('r-preview');
        preview.closePreview();
        preview.pdfMode = 'virtual';
        const ready = new Promise((accept, reject) => {
          preview.addEventListener('load', accept, { once: true });
          preview.addEventListener('error', (event) => reject(new Error(String(event.detail))), { once: true });
        });
        preview.src = '/long.pdf';
        await Promise.race([
          ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Virtual PDF preview timed out')), 15000)),
        ]);
      });
      assert.equal(await page.locator('[data-pdf-page]').count(), 30);
      assert((await page.locator('canvas').count()) <= 6, `${entry}: virtual canvas count must be bounded`);
      await page.locator('.r-preview-context-pdf').evaluate((dom) => {
        dom.scrollTop = dom.scrollHeight;
      });
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('[data-pdf-page="30"] canvas');
          if (!canvas) return false;
          const pixel = canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
          return pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 255 && pixel[3] === 255;
        },
        undefined,
        { timeout: 15000 },
      );
      assert.equal(await page.locator('[data-pdf-page="1"] canvas').count(), 0);
      assert((await page.locator('canvas').count()) <= 6);
      await page.evaluate(() => document.querySelector('r-preview').closePreview());
      assert.equal(await page.locator('[data-pdf-page],canvas').count(), 0);
      assert.deepEqual(failures, [], `${entry}: browser errors and failed assets`);
      await page.close();
      console.log(
        `Installed tarball ${entry}: registration, eager/virtual PDF pixels, cleanup, and packaged font URLs passed`,
      );
    }
  } finally {
    await browser?.close();
    await new Promise((accept, reject) => server.close((error) => (error ? reject(error) : accept())));
  }
}
