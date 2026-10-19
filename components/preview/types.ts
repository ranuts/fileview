export interface BaseReturn<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface RenderOptions {
  /** Virtual PDF rendering retains resources until signal aborts; completion means the first viewport is ready. */
  mode?: 'eager' | 'virtual';
  signal?: AbortSignal;
  dom?: HTMLElement;
  onError?: (msg?: BaseReturn) => void;
  onLoad?: (msg?: BaseReturn) => void;
  iframe?: HTMLIFrameElement;
  iframeReady?: Promise<void>;
  baseUrl?: string;
}
