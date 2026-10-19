import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const workers = new Set<Worker>();
    const urls = new Set<string>();
    const NativeWorker = window.Worker;
    const terminate = NativeWorker.prototype.terminate;
    NativeWorker.prototype.terminate = function () {
      workers.delete(this);
      return terminate.call(this);
    };
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker;
        workers.add(worker);
        return worker;
      },
    });
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      const url = createObjectURL.call(URL, blob);
      urls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      urls.delete(url);
      revokeObjectURL.call(URL, url);
    };
    (window as any).pdfResources = () => ({ workers: workers.size, urls: urls.size });
  });
  await page.goto('/test/fixtures/pdf.html');
  await page.waitForFunction(() => typeof (window as any).renderPdf === 'function');
});

test('PDF completion includes every painted page once at the container width and display density', async ({ page }) => {
  const externalRequests: string[] = [];
  const fontResponses: number[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5199/') && !request.url().startsWith('blob:')) {
      externalRequests.push(request.url());
    }
  });
  page.on('response', (response) => {
    if (response.url().includes('/standard_fonts/')) fontResponses.push(response.status());
  });
  const result = await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-two-pages.pdf')).arrayBuffer()], 'two.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    const loads: number[] = [];
    let errors = 0;
    await (window as any).renderPdf(file, {
      dom,
      onLoad: () => loads.push(dom.querySelectorAll('canvas').length),
      onError: () => errors++,
    });
    return {
      loads,
      errors,
      pages: Array.from(dom.querySelectorAll('canvas'), (canvas) => ({
        size: [canvas.width, canvas.height],
        display: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
        center: Array.from(canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data),
      })),
    };
  });
  expect(result).toEqual({
    loads: [2],
    errors: 0,
    pages: [
      { size: [480, 320], display: [240, 160], center: [255, 0, 0, 255] },
      { size: [400, 600], display: [200, 300], center: [0, 0, 255, 255] },
    ],
  });
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
  expect(externalRequests).toEqual([]);
  expect(fontResponses.length).toBeGreaterThan(0);
  expect(fontResponses.every((status) => status === 200)).toBe(true);
});

test('a malformed PDF rejects promptly so the host can report one error', async ({ page }) => {
  const result = await page.evaluate(async () => {
    let loads = 0;
    let errors = 0;
    const rendering = (window as any)
      .renderPdf(new File(['invalid PDF'], 'broken.pdf'), {
        dom: document.querySelector('#pages'),
        onLoad: () => loads++,
        onError: () => errors++,
      })
      .then(
        () => 'resolved',
        () => 'rejected',
      );
    const outcome = await Promise.race([
      rendering,
      new Promise((resolve) => setTimeout(() => resolve('pending'), 5000)),
    ]);
    return { outcome, loads, errors, pages: document.querySelectorAll('canvas').length };
  });
  expect(result).toEqual({ outcome: 'rejected', loads: 0, errors: 0, pages: 0 });
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});

test('aborting a PDF after its first canvas appears removes partial pages and suppresses callbacks', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-two-pages.pdf')).arrayBuffer()], 'two.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    const controller = new AbortController();
    let loads = 0;
    let errors = 0;
    const observer = new MutationObserver(() => {
      if (dom.querySelector('canvas')) controller.abort();
    });
    observer.observe(dom, { childList: true });
    const outcome = await Promise.race([
      (window as any)
        .renderPdf(file, {
          dom,
          signal: controller.signal,
          onLoad: () => loads++,
          onError: () => errors++,
        })
        .then(
          () => 'resolved',
          () => 'rejected',
        ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 5000)),
    ]);
    observer.disconnect();
    return { outcome, aborted: controller.signal.aborted, loads, errors, pages: dom.querySelectorAll('canvas').length };
  });
  expect(result).toEqual({ outcome: 'resolved', aborted: true, loads: 0, errors: 0, pages: 0 });
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});
