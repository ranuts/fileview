import type { PreviewElement } from './components/preview/core';
export type { PreviewElement } from './components/preview/core';
export type { RenderOptions } from './components/preview/types';

export type PreviewElementConstructor = new () => PreviewElement;
let implementation: PreviewElementConstructor | undefined;

/** Narrow a registration result without treating an unrelated existing tag as a preview. */
export function isPreviewConstructor(value: unknown): value is PreviewElementConstructor {
  return (
    typeof value === 'function' &&
    implementation !== undefined &&
    (value === implementation || value.prototype instanceof implementation)
  );
}

/** Passive entry point: importing this module registers no custom elements. */
export async function registerPreview(
  tagName = 'r-preview',
): Promise<PreviewElementConstructor | CustomElementConstructor | undefined> {
  if (typeof window === 'undefined' || typeof customElements === 'undefined') return undefined;
  const existing = customElements.get(tagName);
  if (existing) return existing;
  const { PreviewElement } = await import('./components/preview/core');
  implementation = PreviewElement;
  // Multiple callers may await the same dynamic import concurrently.
  if (!customElements.get(tagName)) customElements.define(tagName, class extends PreviewElement {});
  return customElements.get(tagName);
}
