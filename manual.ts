export type { PreviewElement } from './components/preview/core';
export type { RenderOptions } from './components/preview/types';

/** Passive entry point: importing this module registers no custom elements. */
export async function registerPreview(tagName = 'r-preview'): Promise<CustomElementConstructor | undefined> {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return undefined;
  const existing = customElements.get(tagName);
  if (existing) return existing;
  const { PreviewElement } = await import('./components/preview/core');
  // Multiple callers may await the same dynamic import concurrently.
  if (!customElements.get(tagName)) customElements.define(tagName, class extends PreviewElement {});
  return customElements.get(tagName);
}
