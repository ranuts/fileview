import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const workers = new Set<Worker>();
    const urls = new Set<string>();
    let workerCount = 0;
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
        workerCount++;
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
    (window as any).pdfWorkerCount = () => workerCount;
    (window as any).crashPdfWorker = () =>
      workers.forEach((worker) => {
        worker.dispatchEvent(new ErrorEvent('error', { message: 'PDF worker stopped' }));
      });
  });
  await page.goto('/test/fixtures/pdf.html');
  await page.waitForFunction(() => typeof (window as any).renderPdf === 'function');
});

test('PDF completion includes every painted page once at the container width and display density', async ({ page }) => {
  const externalRequests: string[] = [];
  const fontResponses: number[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(new URL(page.url()).origin + '/') && !request.url().startsWith('blob:')) {
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

test('painted PDF pages shrink with their container while keeping their aspect ratio and pixels', async ({ page }) => {
  await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-two-pages.pdf')).arrayBuffer()], 'two.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    await (window as any).renderPdf(file, { dom });
    dom.style.width = '120px';
  });
  const sizes = await page.locator('canvas').evaluateAll((canvases) =>
    canvases.map((element) => {
      const canvas = element as HTMLCanvasElement;
      const bounds = canvas.getBoundingClientRect();
      return [bounds.width, bounds.height, canvas.width, canvas.height];
    }),
  );
  expect(sizes).toEqual([
    [120, 80, 480, 320],
    [120, 180, 400, 600],
  ]);
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});

test('large PDF pages preserve display geometry within a bounded canvas pixel budget', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-large-page.pdf')).arrayBuffer()], 'large.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    dom.style.width = '2000px';
    await (window as any).renderPdf(file, { dom });
    const canvas = dom.querySelector('canvas')!;
    return {
      pixels: canvas.width * canvas.height,
      display: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
      center: Array.from(canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data),
    };
  });
  expect(result.pixels).toBeLessThanOrEqual(4_194_304);
  expect(result.display).toEqual([2000, 1600]);
  expect(result.center).toEqual([0, 255, 0, 255]);
});

test.describe('high density screens', () => {
  test.use({ deviceScaleFactor: 4 });

  test('PDF backing resolution caps excessive display density', async ({ page }) => {
    const size = await page.evaluate(async () => {
      const file = new File([await (await fetch('/test/fixtures/pdf-two-pages.pdf')).arrayBuffer()], 'two.pdf');
      const dom = document.querySelector<HTMLElement>('#pages')!;
      await (window as any).renderPdf(file, { dom });
      const canvas = dom.querySelector('canvas')!;
      return [canvas.width, canvas.height];
    });
    expect(size).toEqual([480, 320]);
  });
});

test('virtual PDF mode requires an explicit cancellation owner', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-two-pages.pdf')).arrayBuffer()], 'two.pdf');
    try {
      await (window as any).renderPdf(file, { dom: document.querySelector('#pages'), mode: 'virtual' });
      return 'accepted';
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(message).toContain('AbortSignal');
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});

test('virtual PDF mode paints a bounded viewport buffer and releases offscreen pages and its worker on abort', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-thirty-pages.pdf')).arrayBuffer()], 'thirty.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    dom.style.height = '300px';
    dom.style.overflow = 'auto';
    const controller = new AbortController();
    (window as any).cancelPdf = () => controller.abort();
    (window as any).pdfLoads = 0;
    await (window as any).renderPdf(file, {
      dom,
      mode: 'virtual',
      signal: controller.signal,
      onLoad: () => (window as any).pdfLoads++,
    });
  });
  expect(await page.evaluate(() => (window as any).pdfLoads)).toBe(1);
  expect(await page.locator('[data-pdf-page]').count()).toBe(30);
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(6);
  expect(await page.locator('canvas').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 1, urls: 1 });
  await page.locator('#pages').evaluate((dom) => (dom.scrollTop = dom.scrollHeight));
  await expect
    .poll(() =>
      page.locator('[data-pdf-page="30"] canvas').evaluateAll((canvases) => {
        const canvas = canvases[0] as HTMLCanvasElement | undefined;
        return canvas
          ? Array.from(canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data)
          : [];
      }),
    )
    .toEqual([0, 0, 255, 255]);
  expect(await page.locator('[data-pdf-page="1"] canvas').count()).toBe(0);
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(6);
  await page.evaluate(() => (window as any).cancelPdf());
  await expect.poll(() => page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
  expect(await page.locator('[data-pdf-page], canvas').count()).toBe(0);
});

test('virtual PDF pages redraw on resize without loading the file or creating a worker again', async ({ page }) => {
  await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-thirty-pages.pdf')).arrayBuffer()], 'thirty.pdf');
    let reads = 0;
    const arrayBuffer = file.arrayBuffer.bind(file);
    file.arrayBuffer = () => {
      reads++;
      return arrayBuffer();
    };
    const dom = document.querySelector<HTMLElement>('#pages')!;
    dom.style.cssText = 'width:120px;height:300px;overflow:auto;';
    const controller = new AbortController();
    (window as any).cancelPdf = () => controller.abort();
    (window as any).pdfReadCount = () => reads;
    (window as any).pdfErrors = [];
    await (window as any).renderPdf(file, {
      dom,
      mode: 'virtual',
      signal: controller.signal,
      onError: (error: unknown) => (window as any).pdfErrors.push(error),
    });
    dom.style.width = '200px';
  });
  await expect
    .poll(() =>
      page.locator('[data-pdf-page="1"] canvas').evaluateAll((elements) => {
        const canvas = elements[0] as HTMLCanvasElement | undefined;
        if (!canvas) return [];
        return [
          canvas.width,
          canvas.height,
          ...canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
        ];
      }),
    )
    .toEqual([400, 600, 255, 0, 0, 255]);
  expect(await page.evaluate(() => (window as any).pdfReadCount())).toBe(1);
  expect(await page.evaluate(() => (window as any).pdfWorkerCount())).toBe(1);
  expect(await page.evaluate(() => (window as any).pdfErrors)).toEqual([]);
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 1, urls: 1 });
  await page.evaluate(() => (window as any).cancelPdf());
  await expect.poll(() => page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});

test('aborting virtual PDF during its first paint removes placeholders without reporting load or error', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-thirty-pages.pdf')).arrayBuffer()], 'thirty.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    dom.style.cssText = 'width:240px;height:300px;overflow:auto;';
    const controller = new AbortController();
    let loads = 0;
    let errors = 0;
    const observer = new MutationObserver(() => {
      if (dom.querySelector('canvas')) controller.abort();
    });
    observer.observe(dom, { childList: true, subtree: true });
    await (window as any).renderPdf(file, {
      dom,
      mode: 'virtual',
      signal: controller.signal,
      onLoad: () => loads++,
      onError: () => errors++,
    });
    observer.disconnect();
    return { loads, errors, children: dom.children.length };
  });
  expect(result).toEqual({ loads: 0, errors: 0, children: 0 });
  expect(await page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});

test('resizing during a virtual paint retries the current viewport instead of failing the preview', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-busy-page.pdf')).arrayBuffer()], 'busy.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    dom.style.cssText = 'width:120px;height:300px;overflow:auto;';
    // Keep real canvas painting but force PDF.js to yield, so resize happens during a render task.
    const fill = CanvasRenderingContext2D.prototype.fill;
    let slowFills = 40;
    CanvasRenderingContext2D.prototype.fill = function (...args: any[]) {
      if (slowFills-- > 0) {
        const until = performance.now() + 2;
        while (performance.now() < until) {
          /* expose a real asynchronous rendering window */
        }
      }
      return (fill as any).apply(this, args);
    };
    const controller = new AbortController();
    const observer = new MutationObserver(() => {
      if (dom.querySelector('canvas')) dom.style.width = '200px';
    });
    observer.observe(dom, { childList: true, subtree: true });
    let error = '';
    try {
      await (window as any).renderPdf(file, { dom, mode: 'virtual', signal: controller.signal });
    } catch (reason) {
      error = (reason as Error).message;
    }
    observer.disconnect();
    CanvasRenderingContext2D.prototype.fill = fill;
    const canvas = dom.querySelector('canvas');
    const size = canvas ? [canvas.width, canvas.height] : [];
    controller.abort();
    return { error, size };
  });
  expect(result).toEqual({ error: '', size: [400, 600] });
  await expect.poll(() => page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
});

test('a virtual worker failure after completion reports one error and releases retained resources', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const file = new File([await (await fetch('/test/fixtures/pdf-thirty-pages.pdf')).arrayBuffer()], 'thirty.pdf');
    const dom = document.querySelector<HTMLElement>('#pages')!;
    dom.style.cssText = 'width:240px;height:300px;overflow:auto;';
    const controller = new AbortController();
    (window as any).pdfErrors = [];
    await (window as any).renderPdf(file, {
      dom,
      mode: 'virtual',
      signal: controller.signal,
      onError: (error: unknown) => (window as any).pdfErrors.push(error),
    });
    (window as any).crashPdfWorker();
  });
  await expect.poll(() => page.evaluate(() => (window as any).pdfResources())).toEqual({ workers: 0, urls: 0 });
  expect(await page.evaluate(() => (window as any).pdfErrors)).toEqual([
    { success: false, message: 'PDF worker stopped' },
  ]);
  expect(await page.locator('[data-pdf-page], canvas').count()).toBe(0);
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
