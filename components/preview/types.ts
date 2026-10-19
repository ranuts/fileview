export interface BaseReturn<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface RenderOptions {
  signal?: AbortSignal;
  dom?: HTMLElement;
  onError?: (msg?: BaseReturn) => void;
  onLoad?: (msg?: BaseReturn) => void;
  iframe?: HTMLIFrameElement;
  iframeReady?: Promise<void>;
  baseUrl?: string;
}
