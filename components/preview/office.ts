import { Client } from 'ranuts/utils';
import { createRequestId } from './request-id';
import { encodeOfficeChunks } from './office-chunks';

interface OfficeOptions {
  iframe: HTMLIFrameElement;
  url: URL;
  readonly: boolean;
  signal: AbortSignal;
}

export interface OfficeSession {
  initialReadonly: boolean;
  setReadonly(value: boolean): Promise<void>;
}

function waitForRenderer(options: OfficeOptions, probeLegacy: () => Promise<void>): Promise<boolean> {
  const { iframe, url, signal } = options;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const id = createRequestId();
    let retry: ReturnType<typeof setInterval> | undefined;
    let finished = false;
    let legacyStarted = false;
    const deadline = setTimeout(
      () =>
        finish(
          false,
          new Error(
            options.readonly
              ? 'Read-only mode requires a renderer with the document embed API; update your baseUrl deployment'
              : 'Office renderer did not become ready',
          ),
        ),
      60_000,
    );
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== url.origin) return;
      if (event.data?.type === 'document:ready' || (event.data?.id === id && event.data?.type === 'document:state'))
        finish(true);
    };
    const probe = () => {
      try {
        iframe.contentWindow?.postMessage({ id, type: 'document:get-state' }, url.origin);
      } catch (error) {
        finish(false, error);
      }
    };
    const onLoad = () => {
      clearInterval(retry);
      // Retry because embedded apps can install their message handler after load.
      const loadedAt = performance.now();
      retry = setInterval(() => {
        // Mode may change while the embedded app is still becoming ready.
        if (!legacyStarted && !options.readonly && performance.now() - loadedAt >= 1_500) {
          legacyStarted = true;
          // Only an acknowledged chunk proves legacy support; keep modern probes alive meanwhile.
          void probeLegacy().then(
            () => finish(false),
            (error) => finish(false, error),
          );
        }
        probe();
      }, 250);
      probe();
    };
    const onAbort = () => finish(false, signal.reason);
    const finish = (modern: boolean, error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearInterval(retry);
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(modern);
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', onLoad);
    signal.addEventListener('abort', onAbort, { once: true });
    iframe.src = url.href;
  });
}

function request(
  { iframe, url, signal }: OfficeOptions,
  type: string,
  payload: object,
  responseType: string,
): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const id = createRequestId();
    const timeout = setTimeout(() => finish(new Error('Office document request timed out')), 120_000);
    const onAbort = () => finish(signal.reason);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.origin !== url.origin || event.data?.id !== id) return;
      if (event.data.type === 'document:error')
        finish(new Error(event.data.payload?.message || 'Office request failed'));
      else if (event.data.type === responseType) finish(undefined, event.data.payload);
    };
    const finish = (error?: unknown, result: Record<string, unknown> = {}) => {
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(result);
    };
    window.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      iframe.contentWindow!.postMessage({ id, type, payload }, url.origin);
    } catch (error) {
      finish(error);
    }
  });
}

/** A connection belongs to one preview operation, never the global page. */
export async function renderOffice(file: File, options: OfficeOptions): Promise<OfficeSession> {
  const { iframe, url, signal } = options;
  const legacyController = new AbortController();
  let connection: ReturnType<typeof Client.connect> | undefined;
  let chunks: ReturnType<typeof encodeOfficeChunks> | undefined;
  let remainingChunks = 0;
  const assertLegacyEditable = () => {
    signal.throwIfAborted();
    if (options.readonly)
      throw new Error('Read-only mode requires a renderer with the document embed API; update your baseUrl deployment');
  };
  const dispose = () => {
    legacyController.abort(signal.reason);
    if (connection) Client.remove(connection.id);
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const modern = await waitForRenderer(options, async () => {
      signal.throwIfAborted();
      connection = Client.connect({
        id: createRequestId(),
        targetOrigin: url.origin,
        targetWindow: iframe.contentWindow!,
      });
      chunks = encodeOfficeChunks(file, legacyController.signal);
      const first = await chunks.next();
      legacyController.signal.throwIfAborted();
      assertLegacyEditable();
      if (first.done) throw new Error('Cannot open an empty Office document with a legacy renderer');
      remainingChunks = first.value.totalChunks - 1;
      await Client.call({ id: connection.id, type: 'RENDER_OFFICE', payload: first.value });
      legacyController.signal.throwIfAborted();
      assertLegacyEditable();
    });
    signal.throwIfAborted();
    const readonly = options.readonly;
    if (modern) {
      // A tentative legacy request must not outlive the confirmed modern connection.
      dispose();
      const opened = await request(options, 'document:open-file', { file, readonly }, 'document:opened');
      if (readonly && opened.readonly !== true) throw new Error('Renderer did not enforce read-only mode');
      let pending = Promise.resolve();
      return {
        initialReadonly: readonly,
        setReadonly(value) {
          // Only one command may be in flight, so fast toggles cannot apply out of order.
          const change = pending.then(async () => {
            const changed = await request(
              options,
              'document:set-readonly',
              { readonly: value },
              'document:readonly-changed',
            );
            if (changed.readonly !== value) throw new Error('Renderer did not apply read-only mode');
          });
          pending = change.catch(() => {});
          return change;
        },
      };
    }
    // The first chunk is already acknowledged. Continue the same iterator without sending it twice.
    while (remainingChunks > 0) {
      assertLegacyEditable();
      const chunk = await chunks!.next();
      assertLegacyEditable();
      await Client.call({ id: connection!.id, type: 'RENDER_OFFICE', payload: chunk.value });
      assertLegacyEditable();
      remainingChunks--;
    }
    assertLegacyEditable();
    return {
      initialReadonly: false,
      async setReadonly(value) {
        signal.throwIfAborted();
        if (value)
          throw new Error(
            'Read-only mode requires a renderer with the document embed API; update your baseUrl deployment',
          );
      },
    };
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
  }
}
