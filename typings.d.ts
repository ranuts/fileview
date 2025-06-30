declare module '*.less';
declare module '*.less?inline';
declare module '*.ts';
declare module '*.svg';
declare module '@/assets/*';
declare module '@/public/*';
declare module '@/components/*';
declare module '@/plugins/*';

interface Viewport {
  width: number;
  height: number;
  viewBox: Array<number>;
}
interface RenderContext {
  canvasContext: CanvasRenderingContext2D | null;
  transform: Array<number>;
  viewport: Viewport;
}

interface PDFPageProxy {
  pageNumber: number;
  getViewport: () => Viewport;
  render: (options: RenderContext) => void;
}

interface PDFDocumentProxy {
  numPages: number;
  getPage: (x: number) => Promise<PDFPageProxy>;
}


declare global {
  interface Window {
    ranui: Partial<Ranui>;
    message: Partial<Ran.Message>;
    MathJax: MathJax;
    katex: {
      render: (x: string, y: HTMLElement, z: object) => void;
    };
    pdfjsLib: {
      GlobalWorkerOptions: {
        workerSrc: string;
      };
      getDocument: (x: string | ArrayBuffer) => {
        promise: Promise<PDFDocumentProxy>;
      };
    };
  }
}

interface BaseIntrinsicElements {
  'r-preview': any & {
    src: string;
    closeable: boolean | string;
    baseUrl: string;
  };

}
namespace JSX {
  interface IntrinsicElements extends BaseIntrinsicElements {}
}

namespace React {
  namespace JSX {
    interface IntrinsicElements extends BaseIntrinsicElements {}
  }
}
