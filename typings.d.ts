/** Attributes supported by the r-preview custom element. React is optional. */
export interface PreviewAttributes {
  src?: string;
  closeable?: boolean | string;
  readonly?: boolean | string;
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
    'r-preview': HTMLElement;
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
