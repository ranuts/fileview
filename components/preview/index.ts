import { Client, MessageCodec, noop } from 'ranuts/utils';
import { DOCX, PDF, PPTX, XLS, XLSX } from '@/components/preview/constant';
import type { BaseReturn, RenderOptions } from '@/components/preview/types';
import less from './index.less?inline';
import { ButtonBuilder, Div, Style, View } from 'ranui/builder';
import 'ranui/message';
import 'ranui/icon';
import 'ranui/loading';
import 'ranui/progress';

const message = window.message;


const TARGET_ORIGIN = 'https://ranuts.github.io/document';

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
    const { iframe, onLoad, dom, baseUrl } = options;
    dom?.style.setProperty('display', 'none');
    if (!iframe) return;
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

    class CustomElement extends HTMLElement {
      static get observedAttributes() {
        return ['src', 'closeable'];
      }
      previewContextPdf?: HTMLDivElement;
      _loadingProgress?: HTMLElement;
      previewIframe?: HTMLIFrameElement;
      preview?: HTMLElement | null;
      previewContext?: HTMLDivElement;
      _slot: HTMLSlotElement;
      _div: HTMLElement;
      _loadingElement?: HTMLDivElement;
      _iframe?: HTMLIFrameElement;
      _editorWindow?: Window;
      _closeButton?: HTMLElement;
      _lastFocused?: HTMLElement | null;
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
        this._loadingProgress = View('r-progress')
          .attr('percent', '0')
          .attr('type', 'line')
          .role('progressbar')
          .aria('valuemin', '0')
          .aria('valuemax', '100')
          .aria('valuenow', '0')
          .build();
        this._loadingElement = Div()
          .class('r-preview-loading')
          .role('status')
          .aria('live', 'polite')
          .label('Loading file preview')
          .children(View('r-loading').attr('name', 'circle').ariaHidden(true), this._loadingProgress)
          .build();
        return this._loadingElement;
      };
      onProgress = (event: ProgressEvent<EventTarget>) => {
        if (!event.total) return;
        const num = Math.min(99, (event.loaded / event.total) * 100);
        this._loadingProgress?.setAttribute('percent', num.toFixed(2));
        this._loadingProgress?.setAttribute('aria-valuenow', String(Math.round(num)));
      };
      onError = () => {
        this.preview?.removeChild(this._loadingElement!);
      };
      onLoad = () => {
        this.preview?.removeChild(this._loadingElement!);
      };
      handleFile = async (file: string | File) => {
        try {
          if (typeof file === 'string') {
            const { success, data, message } = await requestUrlToBuffer(file, {
              onProgress: this.onProgress,
              onError: this.onError,
              responseType: 'blob',
            });
            if (success && data) {
              file = new File([data], data.name, { type: data.type });
            } else {
              warning(message);
            }
          }
          if (file instanceof File) {
            const { type } = file;
            const handler = renderFileMap.get(type);
            if (handler && this.previewContext) {
              this.previewContext.style.setProperty('width', '100%');
              const options = {
                dom: this.previewContextPdf,
                onError: this.onError,
                onLoad: this.onLoad,
                iframe: this.previewIframe,
                baseUrl: this.baseUrl,
              };
              handler(file, options);
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
          document.removeEventListener('keydown', this.handleKeydown);
          // 关闭后把焦点交还给触发元素，符合无障碍规范
          this._lastFocused?.focus?.();
        }
      };
      // Esc 关闭预览（模态框无障碍要求）
      handleKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.closePreview();
      };
      // 键盘（Enter/Space）触发预览
      handleTriggerKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.showPreview();
        }
      };
      // 打开预览时：记录当前焦点、监听 Esc、把焦点移入对话框
      openA11y = () => {
        this._lastFocused = document.activeElement as HTMLElement | null;
        document.addEventListener('keydown', this.handleKeydown);
        requestAnimationFrame(() => this._closeButton?.focus());
      };
      showPreview = () => {
        if (this.src) {
          if (this.preview) {
            this.preview.style.display = 'block';
            this.preview.appendChild(this._loadingElement!);
            if (this.previewContextPdf && this.previewContext?.contains(this.previewContextPdf)) {
              this.previewContext.removeChild(this.previewContextPdf);
            }
            this.previewContextPdf = Div().class('r-preview-context-pdf').build();
            this.previewContext?.appendChild(this.previewContextPdf);
            this._loadingElement?.style.setProperty('display', 'block');
          } else {
            this.preliminary();
          }
          this.openA11y();
          this.handleFile(this.src);
        }
      };
      preliminary = () => {
        const previewOption = Div().class('r-preview-options');
        if (this.closeable !== 'false') {
          // 用原生 button 包裹图标：天然可聚焦、Enter/Space 可激活、语义为按钮
          this._closeButton = ButtonBuilder()
            .class('r-preview-options-close')
            .attr('type', 'button')
            .label('Close preview')
            .on('click', this.closePreview)
            .children(View('r-icon').attr('name', 'close-circle-fill').attr('size', '40').ariaHidden(true))
            .build();
          previewOption.children(this._closeButton);
        }
        this.previewContextPdf = Div().class('r-preview-context-pdf').build();
        this.previewIframe = View<HTMLIFrameElement>('iframe')
          .attr('src', this.baseUrl)
          .attr('title', 'Document preview')
          .style({ display: 'none', 'margin-bottom': '30px' })
          // 添加权限策略设置，避免权限策略违规警告
          .attr('allow', 'autoplay; camera; fullscreen; microphone; clipboard-write; display-capture; geolocation')
          .attr('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals')
          .build();
        this.previewContext = Div()
          .class('r-preview-context')
          .children(this.previewContextPdf, this.previewIframe)
          .build();
        this._loadingElement = this.createLoading();
        this.preview = Div()
          .class('r-preview-mask')
          .id('r-preview-mask')
          .role('dialog')
          .attr('aria-modal', 'true')
          .label('File preview')
          .style('display', 'none')
          .children(previewOption, this._loadingElement, Div().class('r-preview-contain').children(this.previewContext))
          .build();
        document.body.appendChild(this.preview);
      };
      connectedCallback() {
        this.preliminary();
        // 让宿主元素可聚焦并支持键盘触发，符合无障碍规范
        if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
        if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
        if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', this.label || 'Preview file');
        this.setAttribute('aria-haspopup', 'dialog');
        this.addEventListener('click', this.showPreview);
        this.addEventListener('keydown', this.handleTriggerKeydown);
      }
      disconnectedCallback() {
        this.removeEventListener('click', this.showPreview);
        this.removeEventListener('keydown', this.handleTriggerKeydown);
        document.removeEventListener('keydown', this.handleKeydown);
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
      const style = Style().text(less).build();
      document.body.appendChild(style);
    }
  }
}

export default Custom();
