import { getDocument, PDFWorker } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import PDF_WORKER_JS from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
import type { RenderOptions } from '@/components/preview/types';

const PDF_ASSETS = new URL(__FILEVIEW_PDF_ASSET_BASE__, import.meta.url);

/** Render every page with an owned worker, so concurrent previews can be cancelled independently. */
export const renderPdf = async (file: File, options: RenderOptions): Promise<void> => {
  const { signal } = options;
  if (signal?.aborted) return;

  const dom = options.dom ?? document.body;
  const canvases: HTMLCanvasElement[] = [];
  let workerUrl: string | undefined;
  let port: Worker | undefined;
  let worker: PDFWorker | undefined;
  let loadingTask: ReturnType<typeof getDocument> | undefined;
  let renderTask: RenderTask | undefined;
  let pdf: PDFDocumentProxy | undefined;
  let completed = false;
  let workerFailed = false;
  let interrupt: (reason: unknown) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  // Cancellation can arrive between awaits; keep its rejection handled until the next race.
  void interrupted.catch(() => {});
  const wait = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, interrupted]);
  const abort = () => {
    renderTask?.cancel();
    interrupt(new DOMException('PDF rendering aborted', 'AbortError'));
  };
  const workerError = (event: ErrorEvent | MessageEvent) => {
    workerFailed = true;
    interrupt(event instanceof ErrorEvent ? new Error(event.message) : new Error('PDF worker message failed'));
  };
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const data = new Uint8Array(await wait(file.arrayBuffer()));
    signal?.throwIfAborted();
    workerUrl = URL.createObjectURL(new Blob([PDF_WORKER_JS], { type: 'text/javascript' }));
    port = new Worker(workerUrl, { type: 'module' });
    port.addEventListener('error', workerError);
    port.addEventListener('messageerror', workerError);
    worker = PDFWorker.create({ port });
    loadingTask = getDocument({
      data,
      worker,
      cMapUrl: new URL('cmaps/', PDF_ASSETS).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('standard_fonts/', PDF_ASSETS).href,
      wasmUrl: new URL('wasm/', PDF_ASSETS).href,
      useSystemFonts: false,
    });
    pdf = await wait(loadingTask.promise);
    dom.style.setProperty('display', 'flex');
    dom.style.setProperty('flex-direction', 'column');

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted();
      const page = await wait(pdf.getPage(pageNumber));
      try {
        signal?.throwIfAborted();
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = dom.clientWidth || baseViewport.width;
        const viewport = page.getViewport({ scale: Math.min(1, availableWidth / baseViewport.width) });
        const density = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width * density);
        canvas.height = Math.ceil(viewport.height * density);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.margin = '0 auto';
        canvas.style.flexShrink = '0';
        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) throw new Error('PDF rendering requires a 2D canvas context');
        canvases.push(canvas);
        dom.append(canvas);
        renderTask = page.render({
          canvas,
          canvasContext,
          viewport,
          transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
        });
        await wait(renderTask.promise);
        renderTask = undefined;
      } finally {
        page.cleanup();
      }
    }
    signal?.throwIfAborted();
    completed = true;
  } catch (error) {
    if (!signal?.aborted) throw error;
  } finally {
    renderTask?.cancel();
    if (loadingTask) {
      const destruction = loadingTask.destroy();
      // A crashed worker cannot acknowledge PDF.js's termination message.
      if (workerFailed) void destruction.catch(() => {});
      else await destruction.catch(() => {});
    }
    worker?.destroy();
    port?.removeEventListener('error', workerError);
    port?.removeEventListener('messageerror', workerError);
    port?.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    signal?.removeEventListener('abort', abort);
    if (!completed || signal?.aborted) {
      for (const canvas of canvases) {
        canvas.remove();
        canvas.width = canvas.height = 0;
      }
    }
  }
  if (completed && !signal?.aborted) options.onLoad?.({ success: true, data: pdf });
};
