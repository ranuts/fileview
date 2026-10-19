import { defineConfig } from 'vite';
import { umd, viteConfig } from '../vite.config.ts';

export default defineConfig({
  ...viteConfig,
  define: {
    __FILEVIEW_PDF_ASSET_BASE__: JSON.stringify('../pdfjs/'),
    'import.meta.url': '__fileview_script_url__',
  },
  build: {
    ...umd,
    rollupOptions: {
      ...umd.rollupOptions,
      output: {
        intro:
          "var __fileview_current_script__ = typeof document !== 'undefined' ? document.currentScript : null;" +
          "var __fileview_script_url__ = typeof document === 'undefined' ? " +
          "(typeof location === 'undefined' ? require('node:url').pathToFileURL(__filename).href : location.href) : " +
          "(__fileview_current_script__ && __fileview_current_script__.src || new URL('index.umd.cjs', document.baseURI).href);",
      },
    },
  },
});
