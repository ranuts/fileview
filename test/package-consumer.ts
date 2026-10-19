import { preview } from '@ranui/preview';
import { isPreviewConstructor, registerPreview } from '@ranui/preview/manual';
import type { RenderOptions } from '@ranui/preview/type';
import type { PreviewAttributes } from '@ranui/preview/typings';
import type * as PreviewModule from '@ranui/preview/preview';
import type * as LegacyModule from '@ranui/preview/dist/index.js';

const options: RenderOptions = {
  dom: document.createElement('div'),
  signal: new AbortController().signal,
  mode: 'virtual',
};
const attributes: PreviewAttributes = {
  src: '/sample.pdf',
  closeable: false,
  baseUrl: 'https://example.com',
  'pdf-mode': 'virtual',
};
const registration: Promise<CustomElementConstructor | undefined> = registerPreview();
const customElement = document.createElement('r-preview');
customElement.src = '/sample.pdf';
customElement.baseUrl = 'https://example.com';
customElement.closeable = 'false';
customElement.readonly = true;
customElement.pdfMode = 'virtual';
const pdfMode: 'eager' | 'virtual' = customElement.pdfMode;
customElement.showPreview();
customElement.closePreview(false);
async function registeredElement() {
  const Constructor = await registerPreview('consumer-preview');
  if (isPreviewConstructor(Constructor)) {
    const element = new Constructor();
    element.src = '/sample.pdf';
    element.baseUrl = 'https://example.com';
    element.readonly = true;
    element.pdfMode = 'virtual';
    element.showPreview();
    element.closePreview();
  }
}
void registeredElement;
const rootNamespace: typeof PreviewModule = preview;
const legacyNamespace: typeof LegacyModule.preview = preview;
void [pdfMode, options, attributes, registration, customElement, rootNamespace, legacyNamespace];
