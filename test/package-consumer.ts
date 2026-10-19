import { preview } from '@ranui/preview';
import { registerPreview } from '@ranui/preview/manual';
import type { RenderOptions } from '@ranui/preview/type';
import type { PreviewAttributes } from '@ranui/preview/typings';
import type * as PreviewModule from '@ranui/preview/preview';
import type * as LegacyModule from '@ranui/preview/dist/index.js';

const options: RenderOptions = { dom: document.createElement('div'), signal: new AbortController().signal };
const attributes: PreviewAttributes = { src: '/sample.pdf', closeable: false, baseUrl: 'https://example.com' };
const registration: Promise<CustomElementConstructor | undefined> = registerPreview();
const customElement: HTMLElement = document.createElement('r-preview');
const rootNamespace: typeof PreviewModule = preview;
const legacyNamespace: typeof LegacyModule.preview = preview;
void [options, attributes, registration, customElement, rootNamespace, legacyNamespace];
