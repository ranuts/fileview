import { Client, MessageCodec, create, noop } from 'ranuts/utils';
import { DOCX, PDF, PPTX, XLS, XLSX } from '@/components/preview/constant';
import type { BaseReturn, RenderOptions } from '@/components/preview/types';
import less from './index.less?inline';
import 'ranui/message';
import 'ranui/icon';

const message = window.message;

const TARGET_ORIGIN = 'https://edit.chaxus.com';

interface RequestUrlToArraybufferOption {
  responseType: XMLHttpRequestResponseType;
  method: string;
  withCredentials: boolean;
  headers: Record<string, string>;
  body: string;
  onProgress?: Function;
  onError?: Function;
  onLoad?: Function;
}

interface requestUrlToArraybufferReturn extends BaseReturn {
  data: Blob & { name: string };
}

const renderOffice = async (file: File, options: RenderOptions) => {
  try {
    const { iframe, iframeReady, onLoad, dom, baseUrl } = options;
    dom?.style.setProperty('display', 'none');
    if (!iframe) return;
    // The editor only attaches its message listener once its JS runs; chunks
    // posted before the iframe finishes loading are silently lost (no retry).
    await iframeReady;
    Client.removeAll();
    const { id } = Client.connect({
      targetOrigin: new URL(baseUrl || TARGET_ORIGIN).origin,
      targetWindow: iframe.contentWindow!,
    });
    const chunks = await MessageCodec.encodeFileChunked(file);
    // 使用 Promise.all 并发发送所有 chunks
    await Promise.all(
      chunks.map((item) =>
        Client.call({
          id,
          type: 'RENDER_OFFICE',
          payload: item,
        }),
      ),
    );
    iframe.style.setProperty('width', '100%');
    iframe.style.setProperty('height', '100%');
    iframe.style.setProperty('border', 'none');
    iframe.style.setProperty('display', 'block');
    onLoad?.();
  } catch (error) {
    console.error('renderOffice error:', error);
    options.onError?.(error);
  }
};

async function Custom() {
  if (typeof document !== 'undefined' && !customElements.get('r-preview')) {
    const { warning = noop } = message!;

    const { renderPdf } = await import('@/components/preview/pdf');

    const requestUrlToBuffer = (
      src: string,
      options: Partial<RequestUrlToArraybufferOption>,
    ): Promise<Partial<requestUrlToArraybufferReturn>> => {
      if (typeof XMLHttpRequest === 'undefined') {
        throw new Error('XMLHttpRequest is not defined');
      }
      if (typeof document === 'undefined') {
        return Promise.reject('document is not defined');
      }
      return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open(options.method || 'GET', src, true);
        xhr.responseType = options.responseType || 'arraybuffer';
        xhr.onload = function () {
          if (xhr.status === 200) {
            const event = { success: true, data: xhr.response, message: '' };
            options.onLoad && options.onLoad(event);
            resolve(event);
          } else {
            const error = { success: false, data: xhr.status, message: `The request status is${xhr.status}` };
            options.onError && options.onError(error);
            reject(error);
          }
        };
        xhr.onerror = function (e) {
          const error = { success: false, data: e, message: `` };
          options.onError && options.onError(error);
          reject(error);
        };
        xhr.onprogress = (event) => {
          options.onProgress && options.onProgress(event);
        };
        xhr.withCredentials = options.withCredentials || false;
        if (options.headers) {
          Object.keys(options.headers).forEach(function (key) {
            options?.headers && xhr.setRequestHeader(key, options.headers[key]);
          });
        }
        xhr.send(options.body);
      });
    };

    const renderFileMap = new Map<string, (file: File, options: RenderOptions) => Promise<void>>([
      [PDF, renderPdf],
      [PPTX, renderOffice],
      [DOCX, renderOffice],
      [XLSX, renderOffice],
      [XLS, renderOffice],
    ]);

    const EXT_MIME: Record<string, string> = {
      pdf: PDF,
      docx: DOCX,
      pptx: PPTX,
      xlsx: XLSX,
      xls: XLS,
    };

    const MIME_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_MIME).map(([e, m]) => [m, e]));

    // XHR blobs carry no filename, and servers frequently mislabel Office
    // extensions (empty, application/octet-stream, even text/xml) — both would
    // silently fail the renderFileMap lookup, so only trust a Content-Type we
    // can actually render and otherwise recover name/type from the URL.
    const inferFileMeta = (src: string, data: Blob & { name?: string }): { name: string; type: string } => {
      let name = data.name || '';
      if (!name) {
        try {
          name = decodeURIComponent(new URL(src, window.location.href).pathname.split('/').pop() || '');
        } catch {
          name = '';
        }
      }
      if (!name) name = 'file';
      const ext = name.split('.').pop()?.toLowerCase() || '';
      const type = renderFileMap.has(data.type) ? data.type : EXT_MIME[ext] || data.type || '';
      // Blob URLs name the file after an extensionless UUID, but the editor
      // detects the format from the extension — recover it from the MIME type.
      if (!EXT_MIME[ext] && MIME_EXT[type]) name = `${name}.${MIME_EXT[type]}`;
      return { name, type };
    };

    class CustomElement extends HTMLElement {
      static get observedAttributes() {
        return ['src', 'closeable'];
      }
      previewContextPdf?: HTMLDivElement;
      _loadingBadge?: HTMLSpanElement;
      _loadingName?: HTMLSpanElement;
      _loadingFill?: HTMLDivElement;
      _loadingStatus?: HTMLSpanElement;
      _loadingPct?: HTMLSpanElement;
      previewIframe?: HTMLIFrameElement;
      _iframeReady?: Promise<void>;
      preview?: HTMLElement | null;
      previewContext?: HTMLDivElement;
      _slot: HTMLSlotElement;
      _div: HTMLElement;
      _loadingElement?: HTMLDivElement;
      _iframe?: HTMLIFrameElement;
      _editorWindow?: Window;
      constructor() {
        super();
        this._div = document.createElement('div');
        this.preview = document.getElementById('r-preview-mask');
        this._slot = document.createElement('slot');
        this._div.appendChild(this._slot);
        this._slot.setAttribute('class', 'r-preview-slot');
        this._div.setAttribute('class', 'r-preview');
        const shadowRoot = this.attachShadow({ mode: 'closed' });
        shadowRoot.appendChild(this._div);
      }
      get label() {
        return this.getAttribute('label');
      }
      set label(value) {
        if (value) this.setAttribute('label', value);
      }
      get src() {
        return this.getAttribute('src');
      }
      set src(value) {
        if (value) this.setAttribute('src', value);
      }
      get closeable() {
        return this.getAttribute('closeable');
      }
      set closeable(value) {
        if (value) this.setAttribute('closeable', value);
      }
      get baseUrl() {
        return this.getAttribute('baseUrl') || TARGET_ORIGIN;
      }
      set baseUrl(value) {
        if (value) this.setAttribute('baseUrl', value);
      }
      createLoading = () => {
        this._loadingElement = document.createElement('div');
        this._loadingElement.setAttribute('class', 'r-preview-loading');
        const card = document.createElement('div');
        card.setAttribute('class', 'r-preview-loading-card');
        const head = document.createElement('div');
        head.setAttribute('class', 'r-preview-loading-head');
        this._loadingBadge = document.createElement('span');
        this._loadingBadge.setAttribute('class', 'r-preview-loading-badge');
        this._loadingName = document.createElement('span');
        this._loadingName.setAttribute('class', 'r-preview-loading-name');
        head.appendChild(this._loadingBadge);
        head.appendChild(this._loadingName);
        const bar = document.createElement('div');
        bar.setAttribute('class', 'r-preview-loading-bar');
        this._loadingFill = document.createElement('div');
        this._loadingFill.setAttribute('class', 'r-preview-loading-bar-fill');
        bar.appendChild(this._loadingFill);
        const foot = document.createElement('div');
        foot.setAttribute('class', 'r-preview-loading-foot');
        this._loadingStatus = document.createElement('span');
        this._loadingStatus.setAttribute('class', 'r-preview-loading-status');
        this._loadingPct = document.createElement('span');
        this._loadingPct.setAttribute('class', 'r-preview-loading-pct');
        foot.appendChild(this._loadingStatus);
        foot.appendChild(this._loadingPct);
        card.appendChild(head);
        card.appendChild(bar);
        card.appendChild(foot);
        this._loadingElement.appendChild(card);
        this.resetLoading();
        return this._loadingElement;
      };
      resetLoading = () => {
        this.setLoadingMeta('');
        this.setLoadingProgress(0, 'Downloading…');
      };
      setLoadingMeta = (name: string) => {
        if (!this._loadingBadge || !this._loadingName) return;
        const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
        this._loadingBadge.textContent = ext || 'FILE';
        this._loadingName.textContent = name || 'Loading file…';
      };
      // percent: 0–100 drives the bar; null switches to the indeterminate shimmer.
      setLoadingProgress = (percent: number | null, status: string) => {
        if (!this._loadingElement || !this._loadingFill || !this._loadingStatus || !this._loadingPct) return;
        this._loadingStatus.textContent = status;
        if (percent === null) {
          this._loadingElement.classList.add('is-indeterminate');
          this._loadingPct.textContent = '';
        } else {
          this._loadingElement.classList.remove('is-indeterminate');
          this._loadingFill.style.setProperty('width', `${percent}%`);
          this._loadingPct.textContent = `${Math.round(percent)}%`;
        }
      };
      onProgress = (event: ProgressEvent<EventTarget>) => {
        // No Content-Length → no meaningful total; fall back to the shimmer.
        if (!event.total) {
          this.setLoadingProgress(null, 'Downloading…');
          return;
        }
        const num = Math.min(99, (event.loaded / event.total) * 100);
        this.setLoadingProgress(num, 'Downloading…');
      };
      onError = () => {
        this._loadingElement?.remove();
      };
      onLoad = () => {
        this._loadingElement?.remove();
      };
      handleFile = async (file: string | File) => {
        try {
          if (typeof file === 'string') {
            const src = file;
            const { success, data, message } = await requestUrlToBuffer(src, {
              onProgress: this.onProgress,
              onError: this.onError,
              responseType: 'blob',
            });
            if (success && data) {
              const { name, type } = inferFileMeta(src, data);
              file = new File([data], name, { type });
            } else {
              warning(message);
            }
          }
          if (file instanceof File) {
            const { type } = file;
            this.setLoadingMeta(file.name);
            this.setLoadingProgress(null, 'Preparing preview…');
            const handler = renderFileMap.get(type);
            if (handler && this.previewContext) {
              this.previewContext.style.setProperty('width', '100%');
              const options = {
                dom: this.previewContextPdf,
                onError: this.onError,
                onLoad: this.onLoad,
                iframe: this.previewIframe,
                iframeReady: this._iframeReady,
                baseUrl: this.baseUrl,
              };
              handler(file, options);
            } else {
              warning(`Unsupported file type: ${type || '(unknown)'}`);
              this.onError();
            }
          }
        } catch (error) {
          console.log('handleFile', error);
        }
      };
      closePreview = () => {
        if (this.preview) {
          Client.broadcast({
            type: 'CLOSE_PREVIEW',
            payload: '',
          });
          Client.removeAll();
          this.previewIframe?.style.setProperty('display', 'none');
          this.preview.style.setProperty('display', 'none');
          if (this.previewContextPdf && this.previewContext) {
            this.previewContext.removeChild(this.previewContextPdf);
          }
        }
      };
      showPreview = () => {
        if (this.src) {
          if (this.preview) {
            this.preview.style.display = 'block';
            this.preview.appendChild(this._loadingElement!);
            if (this.previewContextPdf && this.previewContext?.contains(this.previewContextPdf)) {
              this.previewContext.removeChild(this.previewContextPdf);
            }
            this.previewContextPdf = document.createElement('div');
            this.previewContextPdf.setAttribute('class', 'r-preview-context-pdf');
            this.previewContext?.appendChild(this.previewContextPdf);
            this.resetLoading();
            this._loadingElement?.style.setProperty('display', 'flex');
          } else {
            this.preliminary();
          }
          this.handleFile(this.src);
        }
      };
      preliminary = () => {
        this.preview = document.createElement('div');
        this.preview.setAttribute('class', 'r-preview-mask');
        this.preview.setAttribute('id', 'r-preview-mask');
        const previewOption = document.createElement('div');
        previewOption.setAttribute('class', 'r-preview-options');
        if (this.closeable !== 'false') {
          const previewCloseButton = document.createElement('r-icon');
          previewCloseButton.setAttribute('class', 'r-preview-options-close');
          previewCloseButton.setAttribute('name', 'close-circle-fill');
          previewCloseButton.setAttribute('size', '36');
          previewCloseButton.setAttribute('color', '#ffffff');
          previewCloseButton.addEventListener('click', this.closePreview);
          previewOption.appendChild(previewCloseButton);
        }
        const previewContain = document.createElement('div');
        previewContain.setAttribute('class', 'r-preview-contain');
        this.previewContext = document.createElement('div');
        this.previewContext.setAttribute('class', 'r-preview-context');
        this.previewContextPdf = document.createElement('div');
        this.previewContextPdf.setAttribute('class', 'r-preview-context-pdf');
        this.previewContext.appendChild(this.previewContextPdf);
        this.previewIframe = document.createElement('iframe');
        this._iframeReady = new Promise((resolve) => {
          this.previewIframe!.addEventListener('load', () => resolve(), { once: true });
        });
        this.previewIframe.setAttribute('src', this.baseUrl);
        this.previewIframe.setAttribute('style', 'display: none;');
        this.previewIframe.style.setProperty('margin-bottom', '30px');
        // 添加权限策略设置，避免权限策略违规警告
        this.previewIframe.setAttribute(
          'allow',
          'autoplay; camera; fullscreen; microphone; clipboard-write; display-capture; geolocation',
        );
        this.previewIframe.setAttribute(
          'sandbox',
          'allow-scripts allow-same-origin allow-forms allow-popups allow-modals',
        );
        this.previewContext.appendChild(this.previewIframe);
        previewContain.appendChild(this.previewContext);
        this.preview.appendChild(previewOption);
        this._loadingElement = this.createLoading();
        this.preview.appendChild(this._loadingElement);
        this.preview?.appendChild(previewContain);
        this.preview.style.setProperty('display', 'none');
        document.body.appendChild(this.preview);
      };
      connectedCallback() {
        this.preliminary();
        this.addEventListener('click', this.showPreview);
      }
      disconnectedCallback() {
        this.removeEventListener('click', this.showPreview);
        this.preview && document.body.removeChild(this.preview);
      }
      attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (newValue !== oldValue) {
          if (name === 'src' && newValue) {
            this.setAttribute('src', newValue);
            this.showPreview();
          }
        }
      }
    }
    if (typeof document !== 'undefined' && !customElements.get('r-preview')) {
      customElements.define('r-preview', CustomElement);
      const style = create('style').setTextContent(less);
      document.body.appendChild(style.element);
    }
  }
}

export default Custom();
