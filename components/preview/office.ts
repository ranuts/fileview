import { Client, MessageCodec } from 'ranuts/utils';

interface OfficeOptions {
  iframe: HTMLIFrameElement;
  url: URL;
  readonly: boolean;
  signal: AbortSignal;
}

/** A connection belongs to one preview operation, never the global page. */
export async function renderOffice(file: File, options: OfficeOptions): Promise<void> {
  const { iframe, url, readonly, signal } = options;
  signal.throwIfAborted();
  let bridgeId: string | undefined;
  let dispose = () => {};
  try {
    const modern = await new Promise<boolean>((resolve, reject) => {
      const probeId = crypto.randomUUID();
      let probeTimer: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(() => finish(false, new Error('Office renderer did not become ready')), 60_000);
      const onMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow || event.origin !== url.origin) return;
        if (
          event.data?.type === 'document:ready' ||
          (event.data?.id === probeId && event.data?.type === 'document:state')
        )
          finish(true);
      };
      const onLoad = () => {
        iframe.contentWindow?.postMessage({ id: probeId, type: 'document:get-state' }, url.origin);
        probeTimer = setTimeout(() => finish(false), 600);
      };
      const onAbort = () => finish(false, signal.reason);
      const cleanup = () => {
        clearTimeout(deadline);
        clearTimeout(probeTimer);
        window.removeEventListener('message', onMessage);
        iframe.removeEventListener('load', onLoad);
        signal.removeEventListener('abort', onAbort);
      };
      const finish = (value: boolean, error?: unknown) => {
        cleanup();
        if (error) reject(error);
        else resolve(value);
      };
      window.addEventListener('message', onMessage);
      iframe.addEventListener('load', onLoad);
      signal.addEventListener('abort', onAbort, { once: true });
      iframe.src = url.href;
    });
    signal.throwIfAborted();
    if (modern) {
      await new Promise<void>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = setTimeout(() => finish(new Error('Office document open timed out')), 120_000);
        const onAbort = () => finish(signal.reason);
        const onMessage = (event: MessageEvent) => {
          if (event.source !== iframe.contentWindow || event.origin !== url.origin || event.data?.id !== id) return;
          if (event.data.type === 'document:error')
            finish(new Error(event.data.payload?.message || 'Office open failed'));
          if (event.data.type === 'document:opened') {
            if (readonly && event.data.payload?.readonly !== true)
              finish(new Error('Renderer did not enforce read-only mode'));
            else finish();
          }
        };
        const finish = (error?: unknown) => {
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          signal.removeEventListener('abort', onAbort);
          if (error) reject(error);
          else resolve();
        };
        window.addEventListener('message', onMessage);
        signal.addEventListener('abort', onAbort, { once: true });
        iframe.contentWindow!.postMessage({ id, type: 'document:open-file', payload: { file, readonly } }, url.origin);
      });
    } else {
      if (readonly)
        throw new Error(
          'Read-only mode requires a renderer with the document embed API; update your baseUrl deployment',
        );
      const connection = Client.connect({ targetOrigin: url.origin, targetWindow: iframe.contentWindow! });
      bridgeId = connection.id;
      dispose = () => Client.remove(connection.id);
      signal.addEventListener('abort', dispose, { once: true });
      const chunks = await MessageCodec.encodeFileChunked(file);
      signal.throwIfAborted();
      // Preserve the original chunk protocol for existing self-hosted renderers.
      for (const chunk of chunks) {
        await Client.call({ id: connection.id, type: 'RENDER_OFFICE', payload: chunk });
        signal.throwIfAborted();
      }
    }
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', dispose);
    if (bridgeId) Client.remove(bridgeId);
  }
}
