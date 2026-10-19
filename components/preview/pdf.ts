import { getDocument, PDFWorker } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import PDF_WORKER_JS from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';
import type { RenderOptions } from '@/components/preview/types';

const PDF_ASSETS = new URL(__FILEVIEW_PDF_ASSET_BASE__, import.meta.url);
const MAX_CANVAS_PIXELS = 4_194_304;
const MAX_CANVAS_DIMENSION = 8192;
const MAX_LIVE_PAGES = 6;

/** Eager completion paints every page; virtual completion paints the first viewport buffer. */
export const renderPdf = async (file: File, options: RenderOptions): Promise<void> => {
  const { signal } = options;
  const virtual = options.mode === 'virtual';
  if (virtual && !signal) throw new Error('Virtual PDF rendering requires an AbortSignal for cleanup');
  if (signal?.aborted) return;

  const dom = options.dom ?? document.body;
  const canvases = new Set<HTMLCanvasElement>();
  const placeholders: HTMLDivElement[] = [];
  let workerUrl: string | undefined;
  let port: Worker | undefined;
  let worker: PDFWorker | undefined;
  let loadingTask: ReturnType<typeof getDocument> | undefined;
  let renderTask: RenderTask | undefined;
  let pdf: PDFDocumentProxy | undefined;
  let completed = false;
  let retained = false;
  let workerFailed = false;
  let disposal: Promise<void> | undefined;
  let disconnectViewport = () => {};
  let interrupt: (reason: unknown) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = reject;
  });
  // Cancellation can arrive between awaits; keep its rejection handled until the next race.
  void interrupted.catch(() => {});
  const wait = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, interrupted]);
  const release = (canvas: HTMLCanvasElement) => {
    canvas.remove();
    canvas.width = canvas.height = 0;
    canvases.delete(canvas);
  };
  const dispose = (removePages: boolean): Promise<void> => {
    if (disposal) return disposal;
    disconnectViewport();
    renderTask?.cancel();
    signal?.removeEventListener('abort', abort);
    if (removePages) {
      for (const canvas of canvases) release(canvas);
      for (const placeholder of placeholders) placeholder.remove();
    }
    disposal = (async () => {
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
    })();
    return disposal;
  };
  const abort = () => {
    renderTask?.cancel();
    interrupt(new DOMException('PDF rendering aborted', 'AbortError'));
    if (retained) void dispose(true);
  };
  const backgroundError = (error: unknown) => {
    if (signal?.aborted || disposal) return;
    void dispose(true);
    options.onError?.({ success: false, message: error instanceof Error ? error.message : String(error) });
  };
  const workerError = (event: ErrorEvent | MessageEvent) => {
    workerFailed = true;
    const error = event instanceof ErrorEvent ? new Error(event.message) : new Error('PDF worker message failed');
    interrupt(error);
    if (retained) backgroundError(error);
  };
  signal?.addEventListener('abort', abort, { once: true });

  const paint = async (pageNumber: number, parent: HTMLElement) => {
    signal?.throwIfAborted();
    const page = await wait(pdf!.getPage(pageNumber));
    let canvas: HTMLCanvasElement | undefined;
    try {
      signal?.throwIfAborted();
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = dom.clientWidth || baseViewport.width;
      const viewport = page.getViewport({ scale: Math.min(1, availableWidth / baseViewport.width) });
      const density = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
        MAX_CANVAS_DIMENSION / viewport.width,
        MAX_CANVAS_DIMENSION / viewport.height,
      );
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * density));
      canvas.height = Math.max(1, Math.floor(viewport.height * density));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      canvas.style.margin = '0 auto';
      canvas.style.flexShrink = '0';
      canvas.style.display = 'block';
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) throw new Error('PDF rendering requires a 2D canvas context');
      canvases.add(canvas);
      parent.append(canvas);
      renderTask = page.render({
        canvas,
        canvasContext,
        viewport,
        transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
      });
      await wait(renderTask.promise);
      renderTask = undefined;
    } catch (error) {
      if (canvas) release(canvas);
      throw error;
    } finally {
      page.cleanup();
    }
  };

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

    if (!virtual) {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) await paint(pageNumber, dom);
    } else {
      const widths: number[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await wait(pdf.getPage(pageNumber));
        const viewport = page.getViewport({ scale: 1 });
        page.cleanup();
        const placeholder = document.createElement('div');
        placeholder.dataset.pdfPage = String(pageNumber);
        placeholder.style.cssText = 'max-width:100%;height:auto;flex-shrink:0;margin:0 auto;';
        placeholder.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        widths.push(viewport.width);
        placeholder.style.width = `${Math.min(dom.clientWidth || viewport.width, viewport.width)}px`;
        placeholders.push(placeholder);
        dom.append(placeholder);
      }

      let selected = new Set<number>();
      let activePage = -1;
      let dirty = false;
      let layoutVersion = 0;
      let pending: Promise<void> | undefined;
      const selectPages = () => {
        const root = dom.getBoundingClientRect();
        const height = dom.clientHeight || window.innerHeight;
        const center = root.top + height / 2;
        const nearby = placeholders
          .map((placeholder, index) => ({ index, bounds: placeholder.getBoundingClientRect() }))
          .filter(({ bounds }) => bounds.bottom >= root.top - height && bounds.top <= root.top + height * 2)
          .sort(
            (a, b) =>
              Math.abs((a.bounds.top + a.bounds.bottom) / 2 - center) -
              Math.abs((b.bounds.top + b.bounds.bottom) / 2 - center),
          )
          .slice(0, MAX_LIVE_PAGES);
        selected = new Set(nearby.map(({ index }) => index));
        if (activePage >= 0 && !selected.has(activePage)) renderTask?.cancel();
        for (let index = 0; index < placeholders.length; index++) {
          if (!selected.has(index)) {
            for (const canvas of placeholders[index].querySelectorAll('canvas')) release(canvas);
          }
        }
      };
      const pump = async () => {
        do {
          dirty = false;
          selectPages();
          for (const index of selected) {
            if (dirty || signal!.aborted || disposal) break;
            if (placeholders[index].querySelector('canvas')) continue;
            activePage = index;
            const paintingLayout = layoutVersion;
            try {
              await paint(index + 1, placeholders[index]);
            } catch (error) {
              if ((selected.has(index) && paintingLayout === layoutVersion) || signal!.aborted) throw error;
            } finally {
              activePage = -1;
            }
          }
        } while (dirty && !signal!.aborted && !disposal);
      };
      const schedule = () => {
        if (signal!.aborted || disposal) return;
        dirty = true;
        selectPages();
        if (!pending) {
          pending = pump().finally(() => {
            pending = undefined;
          });
          void pending.catch((error) => {
            if (retained) backgroundError(error);
          });
        }
      };
      const resize = new ResizeObserver(() => {
        let changed = false;
        placeholders.forEach((placeholder, index) => {
          const width = `${Math.min(dom.clientWidth || widths[index], widths[index])}px`;
          if (placeholder.style.width === width) return;
          changed = true;
          placeholder.style.width = width;
          for (const canvas of placeholder.querySelectorAll('canvas')) release(canvas);
        });
        if (changed) {
          layoutVersion++;
          renderTask?.cancel();
          schedule();
        }
      });
      const intersection = new IntersectionObserver(schedule, { root: dom, rootMargin: '100% 0px' });
      placeholders.forEach((placeholder) => intersection.observe(placeholder));
      resize.observe(dom);
      dom.addEventListener('scroll', schedule, { passive: true });
      disconnectViewport = () => {
        resize.disconnect();
        intersection.disconnect();
        dom.removeEventListener('scroll', schedule);
      };
      schedule();
      await pending;
      signal!.throwIfAborted();
      retained = true;
    }
    signal?.throwIfAborted();
    completed = true;
  } catch (error) {
    if (!signal?.aborted) throw error;
  } finally {
    if (!retained) await dispose(!completed || !!signal?.aborted);
  }
  if (completed && !signal?.aborted) options.onLoad?.({ success: true, data: pdf });
};
