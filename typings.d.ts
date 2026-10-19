import type { PreviewElement } from './components/preview/core.js';

/** Attributes supported by the r-preview custom element. React is optional. */
export interface PreviewAttributes {
  src?: string;
  closeable?: boolean | string;
  readonly?: boolean | string;
  'pdf-mode'?: 'eager' | 'virtual';
  baseUrl?: string;
  baseurl?: string;
  label?: string;
  id?: string;
  class?: string;
  className?: string;
  slot?: string;
  title?: string;
  role?: string;
  tabIndex?: number;
  children?: unknown;
  [attribute: string]: unknown;
  [attribute: `aria-${string}`]: string | number | boolean | undefined;
  [attribute: `data-${string}`]: string | number | boolean | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'r-preview': PreviewElement;
  }
  namespace JSX {
    interface IntrinsicElements {
      'r-preview': PreviewAttributes;
    }
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'r-preview': PreviewAttributes;
      }
    }
  }
}
