import { defineConfig } from 'vite';
import { es, viteConfig } from '../vite.config.ts';

export default defineConfig({
  ...viteConfig,
  define: { __FILEVIEW_PDF_ASSET_BASE__: JSON.stringify('./pdfjs/') },
  build: es,
});
