import { DOCX, PDF, PPTX, XLS, XLSX } from './constant';
import { renderOffice } from './office';
import less from './index.less?inline';

const DEFAULT_RENDERER = 'https://edit.chaxus.com';
const mimeByExtension: Record<string, string> = { pdf: PDF, docx: DOCX, pptx: PPTX, xlsx: XLSX, xls: XLS };
const supported = new Set(Object.values(mimeByExtension));
const opened: PreviewElement[] = [];
function div(className: string, ...children: Node[]): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  element.append(...children);
  return element;
}

/** Browser implementation, loaded only when registration is explicitly requested. */
export class PreviewElement extends HTMLElement {
  static observedAttributes = ['src', 'closeable', 'readonly', 'baseurl', 'label'];
  private modal?: HTMLDivElement;
  private context?: HTMLDivElement;
  private loading?: HTMLDivElement;
  private closeButton?: HTMLButtonElement;
  private operation?: AbortController;
  private previousFocus?: HTMLElement;
  private focusFrame?: number;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      ':host{cursor:pointer;display:inline-block}:host(:focus-visible){outline:2px solid #006bff;outline-offset:2px}';
    shadow.append(style, document.createElement('slot'));
  }
  get src(): string | null {
    return this.getAttribute('src');
  }
  set src(value: string | null) {
    if (value) this.setAttribute('src', value);
    else this.removeAttribute('src');
  }
  get label(): string | null {
    return this.getAttribute('label');
  }
  set label(value: string | null) {
    if (value) this.setAttribute('label', value);
    else this.removeAttribute('label');
  }
  get baseUrl(): string {
    return this.getAttribute('baseurl') || DEFAULT_RENDERER;
  }
  set baseUrl(value: string) {
    this.setAttribute('baseurl', value);
  }
  // Retain the existing string attribute/property contract.
  get closeable(): string | null {
    return this.getAttribute('closeable');
  }
  set closeable(value: string | null) {
    if (value === null) this.removeAttribute('closeable');
    else this.setAttribute('closeable', value);
  }
  get readonly(): boolean {
    return this.hasAttribute('readonly') && this.getAttribute('readonly') !== 'false';
  }
  set readonly(value: boolean) {
    if (value) this.setAttribute('readonly', '');
    else this.removeAttribute('readonly');
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (!this.hasAttribute('aria-label'))
      this.setAttribute('aria-label', this.label || this.textContent?.trim() || 'Preview file');
    this.setAttribute('aria-haspopup', 'dialog');
    this.addEventListener('click', this.showPreview);
    this.addEventListener('keydown', this.triggerKeydown);
    if (this.src) this.showPreview();
  }
  disconnectedCallback() {
    this.removeEventListener('click', this.showPreview);
    this.removeEventListener('keydown', this.triggerKeydown);
    this.closePreview(false);
    this.modal?.remove();
    this.modal = undefined;
  }
  attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
    if (oldValue === value || !this.isConnected) return;
    if (name === 'label') this.setAttribute('aria-label', value || this.textContent?.trim() || 'Preview file');
    else if (name === 'src') {
      if (value) this.showPreview();
      else this.closePreview();
    } else if (this.modal?.style.display !== 'none' && this.modal) this.showPreview();
  }
  private triggerKeydown = (event: KeyboardEvent) => {
    if (event.target === this && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.showPreview();
    }
  };
  private dialogKeydown = (event: KeyboardEvent) => {
    if (opened.at(-1) !== this) return;
    if (event.key === 'Escape' && this.closeable !== 'false') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closePreview();
    } else if (event.key === 'Tab' && this.modal) {
      const controls = Array.from(this.modal.querySelectorAll<HTMLElement>('button, iframe, [tabindex="0"]'));
      const first = controls[0] || this.modal;
      const last = controls.at(-1) || this.modal;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === this.modal)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  closePreview = (restoreFocus: boolean | Event = true) => {
    this.operation?.abort();
    this.operation = undefined;
    this.context?.replaceChildren();
    if (this.modal) this.modal.style.display = 'none';
    if (this.focusFrame !== undefined) cancelAnimationFrame(this.focusFrame);
    document.removeEventListener('keydown', this.dialogKeydown);
    const index = opened.indexOf(this);
    if (index >= 0) opened.splice(index, 1);
    this.setAttribute('aria-expanded', 'false');
    if (restoreFocus !== false && this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = undefined;
  };
  private createModal() {
    if (!document.querySelector('style[data-fileview]')) {
      const style = document.createElement('style');
      style.dataset.fileview = '';
      style.textContent = less;
      document.head.append(style);
    }
    this.context = div('r-preview-context');
    this.modal = div('r-preview-mask');
    this.modal.id = document.getElementById('r-preview-mask')
      ? `r-preview-mask-${crypto.randomUUID()}`
      : 'r-preview-mask';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-label', 'File preview');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.tabIndex = -1;
    this.modal.append(div('r-preview-options'), div('r-preview-contain', this.context));
    document.body.append(this.modal);
  }
  private updateCloseButton() {
    const options = this.modal!.querySelector('.r-preview-options')!;
    options.replaceChildren();
    this.closeButton = undefined;
    if (this.closeable !== 'false') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'r-preview-options-close';
      button.setAttribute('aria-label', 'Close preview');
      button.textContent = '×';
      button.addEventListener('click', this.closePreview);
      options.append(button);
      this.closeButton = button;
    }
  }
  private createLoading() {
    const badge = document.createElement('span');
    badge.className = 'r-preview-loading-badge';
    badge.textContent = 'FILE';
    const name = document.createElement('span');
    name.className = 'r-preview-loading-name';
    name.textContent = 'Loading file…';
    const status = document.createElement('span');
    status.className = 'r-preview-loading-status';
    status.textContent = 'Preparing preview…';
    const bar = div('r-preview-loading-bar', div('r-preview-loading-bar-fill'));
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Loading file preview');
    this.loading?.remove();
    this.loading = div(
      'r-preview-loading is-indeterminate',
      div(
        'r-preview-loading-card',
        div('r-preview-loading-head', badge, name),
        bar,
        div('r-preview-loading-foot', status),
      ),
    );
    this.loading.setAttribute('role', 'status');
    this.loading.setAttribute('aria-live', 'polite');
    this.modal!.append(this.loading);
  }
  showPreview = () => {
    if (!this.src || !this.isConnected) return;
    this.operation?.abort();
    const controller = new AbortController();
    this.operation = controller;
    if (!this.modal) this.createModal();
    if (!this.modal!.contains(document.activeElement))
      this.previousFocus =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : this;
    this.context!.replaceChildren();
    this.modal!.style.display = 'block';
    // Keep paint order aligned with the keyboard stack when an older instance reopens.
    document.body.append(this.modal!);
    this.updateCloseButton();
    this.createLoading();
    const previousIndex = opened.indexOf(this);
    if (previousIndex >= 0) opened.splice(previousIndex, 1);
    opened.push(this);
    this.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', this.dialogKeydown);
    if (this.focusFrame !== undefined) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => (this.closeButton || this.modal)?.focus());
    void this.load(this.src, controller);
  };
  private async load(src: string, controller: AbortController) {
    const { signal } = controller;
    const current = () => !signal.aborted && this.operation === controller && this.isConnected;
    try {
      const response = await fetch(src, { signal });
      if (!response.ok) throw new Error(`Failed to load document (HTTP ${response.status})`);
      const blob = await response.blob();
      signal.throwIfAborted();
      let name = decodeURIComponent(new URL(src, location.href).pathname.split('/').pop() || 'file');
      const extension = name.split('.').pop()?.toLowerCase() || '';
      const type = supported.has(blob.type) ? blob.type : mimeByExtension[extension] || blob.type;
      if (!supported.has(type)) throw new Error(`Unsupported file type: ${type || '(unknown)'}`);
      if (!mimeByExtension[extension])
        name += `.${Object.keys(mimeByExtension).find((key) => mimeByExtension[key] === type)}`;
      const file = new File([blob], name, { type });
      this.loading!.querySelector('.r-preview-loading-name')!.textContent = name;
      this.loading!.querySelector('.r-preview-loading-badge')!.textContent = name.split('.').pop()!.toUpperCase();
      if (type === PDF) {
        const container = div('r-preview-context-pdf');
        this.context!.append(container);
        const { renderPdf } = await import('./pdf');
        signal.throwIfAborted();
        await renderPdf(file, { dom: container, signal });
      } else {
        const iframe = document.createElement('iframe');
        iframe.title = 'Document preview';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
        iframe.setAttribute('allow', 'clipboard-write; fullscreen');
        iframe.style.cssText = 'width:100%;height:100%;border:0';
        this.context!.style.width = '100%';
        this.context!.append(iframe);
        const url = new URL(this.baseUrl, location.href);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('baseUrl must be an HTTP(S) renderer URL');
        await renderOffice(file, { iframe, url, readonly: this.readonly, signal });
      }
      if (!current()) return;
      this.loading?.remove();
      this.dispatchEvent(new CustomEvent('load', { bubbles: true, composed: true }));
    } catch (error) {
      if (!current()) return;
      this.loading?.remove();
      const alert = div('r-preview-error');
      alert.setAttribute('role', 'alert');
      alert.textContent = error instanceof Error ? error.message : String(error);
      this.context!.replaceChildren(alert);
      this.dispatchEvent(new CustomEvent('error', { bubbles: true, composed: true, detail: error }));
    }
  }
}
