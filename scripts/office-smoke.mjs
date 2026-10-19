/** Opt in: FILEVIEW_LIVE_OFFICE=1 pnpm exec tsx scripts/office-smoke.mjs
 * Start Vite separately on 5201. Network/renderer results are intentionally outside CI.
 * Synthetic large-image coverage cannot establish that an unavailable Issue #4 sample is fixed.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { readZipEntries, readZipEntry } from 'ranuts/utils';
import { buildDocx, buildPptx, buildLargeImageDocx, LARGE_IMAGE_TEXT } from '../test/fixtures/office-ooxml.ts';

if (process.env.FILEVIEW_LIVE_OFFICE !== '1') {
  console.log('Skipped live Office integration; set FILEVIEW_LIVE_OFFICE=1 to opt in.');
  process.exit(0);
}
const base = process.env.FILEVIEW_LIVE_BASE || 'http://127.0.0.1:5201';
const onlyCase = process.env.FILEVIEW_LIVE_CASE;
const renderer = process.env.FILEVIEW_LIVE_RENDERER || 'https://edit.chaxus.com';
const output = process.env.FILEVIEW_LIVE_OUTPUT || `/tmp/fileview-office-live-${Date.now()}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = {
  renderer,
  output,
  cases: [],
  limitation: 'Synthetic 4000px-image sample; original Issue #4 attachment not supplied.',
};

async function request(page, type, payload = {}) {
  return page.evaluate(
    async ({ type, payload, origin }) => {
      const frame = document.querySelector('iframe');
      if (!frame?.contentWindow) throw new Error('No live Office iframe');
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`${type} timed out after 120s`)), 120_000);
        const listen = (event) => {
          if (event.source !== frame.contentWindow || event.origin !== origin || event.data?.id !== id) return;
          if (event.data.type === 'document:error') finish(new Error(event.data.payload?.message || 'Renderer error'));
          else if (
            event.data.type === { 'document:get-state': 'document:state', 'document:save': 'document:saved' }[type]
          )
            finish(null, event.data.payload);
        };
        const finish = async (error, value) => {
          clearTimeout(timer);
          window.removeEventListener('message', listen);
          if (error) return reject(error);
          if (value?.file instanceof Blob) {
            const bytes = new Uint8Array(await value.file.arrayBuffer());
            let binary = '';
            for (let i = 0; i < bytes.length; i += 32768)
              binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
            value = { ...value, file: undefined, base64: btoa(binary) };
          }
          resolve(value);
        };
        window.addEventListener('message', listen);
        frame.contentWindow.postMessage({ id, type, payload }, origin);
      });
    },
    { type, payload, origin: new URL(renderer).origin },
  );
}

async function sdkState(page, timeout = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const frame of page.frames()) {
      try {
        const state = await frame.evaluate(() => {
          const api = window.Asc?.editor;
          if (!api?.isDocumentLoadComplete || !api?.isLoadFullApi || typeof api.canEdit !== 'function') return null;
          return {
            restrictions: api.restrictions,
            canEdit: api.canEdit(),
            isViewMode: api.isViewMode,
            version: window.AscCommon?.g_cAscVersion || null,
          };
        });
        if (state) return state;
      } catch {
        /* frame can disappear during editor startup */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Live SDK did not report fully loaded state within 120s');
}

async function open(name, bytes, readonly) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  // Root development continues concurrently; HMR reloads must not interrupt network smoke checks.
  await page.route('**/@vite/client', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery = (url) => url;' }),
  );
  await page.route(`**/office-live-fixture.${name.split('.').pop()}`, (route) =>
    route.fulfill({
      contentType: name.endsWith('.pptx')
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from(bytes),
    }),
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/test/fixtures/preview.html`);
  await page.evaluate(
    async ({ renderer, readonly, ext }) => {
      await customElements.whenDefined('r-preview');
      window.__officeSmoke = { loads: 0, errors: [], messages: [] };
      window.addEventListener('message', (event) => {
        if (
          event.source !== document.querySelector('iframe')?.contentWindow ||
          event.origin !== new URL(renderer).origin
        )
          return;
        if (typeof event.data?.type === 'string' && event.data.type.startsWith('document:'))
          window.__officeSmoke.messages.push({ type: event.data.type, payload: event.data.payload, id: event.data.id });
      });
      const element = document.createElement('r-preview');
      element.textContent = 'Open live Office';
      element.baseUrl = renderer;
      if (readonly) element.setAttribute('readonly', '');
      element.addEventListener('load', () => window.__officeSmoke.loads++);
      element.addEventListener('error', (event) =>
        window.__officeSmoke.errors.push(String(event.detail?.message || event.detail)),
      );
      element.setAttribute('src', `/office-live-fixture.${ext}`);
      document.body.append(element);
    },
    { renderer, readonly, ext: name.split('.').pop() },
  );
  try {
    await page.waitForFunction(() => window.__officeSmoke.loads || window.__officeSmoke.errors.length, undefined, {
      timeout: 180_000,
    });
    const host = await page.evaluate(() => window.__officeSmoke);
    assert.deepEqual(host.errors, [], `Fileview open errors: ${JSON.stringify(host.errors)}`);
    assert.equal(host.loads, 1, 'Fileview must complete once after the live renderer opens');
    assert.ok(
      host.messages.some((event) => event.type === 'document:opened'),
      'Modern document:opened response must precede load',
    );
    const state = await request(page, 'document:get-state');
    assert.equal(state.hasDocument, true);
    assert.equal(state.readonly, readonly);
    const sdk = await sdkState(page);
    assert.equal(sdk.canEdit, !readonly, 'SDK edit permission must match host read-only option');
    assert.equal(sdk.restrictions, readonly ? 128 : 0, 'Restriction must reach real SDK');
    await page.screenshot({ path: `${output}/${name}.png` });
    return { context, page, state, sdk, errors, hostMessages: host.messages.map((item) => item.type) };
  } catch (error) {
    await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
    await context.close();
    throw error;
  }
}

try {
  for (const [name, build, readonly] of [
    ['readonly.docx', () => buildDocx('Readonly DOCX 只读验证'), true],
    ['readonly.pptx', () => buildPptx('Readonly PPTX 只读验证'), true],
    ['default.docx', () => buildDocx('Default editable DOCX 默认编辑'), false],
    ['default.pptx', () => buildPptx('Default editable PPTX 默认编辑'), false],
  ].filter(([name]) => !onlyCase || name === onlyCase)) {
    let live;
    const result = { name };
    try {
      live = await open(name, build(), readonly);
      let saveError = '';
      try {
        if (readonly) await request(live.page, 'document:save');
      } catch (error) {
        saveError = error.message;
      }
      if (readonly) assert.match(saveError, /read.?only/i, 'Read-only save must explicitly reject, without timing out');
      Object.assign(result, {
        passed: true,
        state: live.state,
        sdk: live.sdk,
        saveError,
        hostMessages: live.hostMessages,
        pageErrors: live.errors,
      });
    } catch (error) {
      Object.assign(result, { passed: false, error: error.stack });
    } finally {
      await live?.context.close();
    }
    report.cases.push(result);
    console.log(JSON.stringify(result));
  }
  if (!onlyCase || onlyCase === 'large-image.docx') {
    let live;
    const result = { name: 'large-image.docx' };
    try {
      const original = await buildLargeImageDocx();
      await writeFile(`${output}/large-image-source.docx`, original);
      live = await open('large-image.docx', original, false);
      const savedDocx = await request(live.page, 'document:save', { targetExt: 'docx' });
      const docx = Buffer.from(savedDocx.base64, 'base64');
      await writeFile(`${output}/large-image-export.docx`, docx);
      const xml = new TextDecoder().decode(await readZipEntry(docx, 'word/document.xml'));
      const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');
      for (const expected of LARGE_IMAGE_TEXT) assert.ok(text.includes(expected), `DOCX lost text: ${expected}`);
      const images = readZipEntries(docx).filter(({ name }) => /^word\/media\//.test(name));
      assert.ok(images.length > 0, 'DOCX export must preserve the image');
      const savedPdf = await request(live.page, 'document:save', { targetExt: 'pdf' });
      const pdf = Buffer.from(savedPdf.base64, 'base64');
      await writeFile(`${output}/large-image-export.pdf`, pdf);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      const pdfContent = await live.page.evaluate(
        async ({ base64, base }) => {
          const pdfjs = await import(`${base}/node_modules/pdfjs-dist/build/pdf.mjs`);
          pdfjs.GlobalWorkerOptions.workerSrc = `${base}/node_modules/pdfjs-dist/build/pdf.worker.mjs`;
          const loadingTask = pdfjs.getDocument({ data: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)) });
          const pdf = await loadingTask.promise;
          let text = '';
          let images = 0;
          for (let index = 1; index <= pdf.numPages; index++) {
            const page = await pdf.getPage(index);
            text += (await page.getTextContent()).items.map((item) => item.str || '').join('');
            const operators = await page.getOperatorList();
            const imageOps = [
              pdfjs.OPS.paintImageXObject,
              pdfjs.OPS.paintInlineImageXObject,
              pdfjs.OPS.paintImageXObjectRepeat,
            ];
            // x2t wraps document images in PDF tiling patterns; inspect nested operator lists too.
            const visit = (value) => {
              if (value?.fnArray) {
                images += value.fnArray.filter((op) => imageOps.includes(op)).length;
                value.argsArray.forEach(visit);
              } else if (Array.isArray(value)) value.forEach(visit);
            };
            visit(operators);
          }
          const result = { text, images, pages: pdf.numPages };
          await loadingTask.destroy();
          return result;
        },
        { base64: savedPdf.base64, base },
      );
      for (const expected of LARGE_IMAGE_TEXT)
        assert.ok(
          pdfContent.text.replace(/\s/g, '').includes(expected.replace(/\s/g, '')),
          `PDF lost text: ${expected}; got ${pdfContent.text}`,
        );
      assert.ok(pdfContent.images > 0, 'PDF export must contain image paint operators');
      Object.assign(result, {
        passed: true,
        state: live.state,
        sdk: live.sdk,
        docxBytes: docx.length,
        docxImages: images.length,
        pdfBytes: pdf.length,
        pdfContent,
        pageErrors: live.errors,
      });
    } catch (error) {
      Object.assign(result, { passed: false, error: error.stack });
    } finally {
      await live?.context.close();
    }
    report.cases.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Live Office report: ${output}/report.json`);
}
if (report.cases.some((result) => !result.passed)) process.exitCode = 1;
