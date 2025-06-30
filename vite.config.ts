import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { BuildOptions, PluginOption, UserConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import type { RollupOptions } from 'rollup';
import { babel } from '@rollup/plugin-babel';
import loadStyle from './plugins/load-style';
import { PORT } from './build/config';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

interface chunkOptimization {
  assetsInlineLimit: number;
  chunkSizeWarningLimit: number;
  reportCompressedSize: boolean;
  rollupOptions: RollupOptions;
  minify: boolean | 'terser' | 'esbuild' | undefined;
}

const chunkOptimization: Partial<chunkOptimization> = {
  chunkSizeWarningLimit: 500,
  assetsInlineLimit: 1024,
  reportCompressedSize: false,
  rollupOptions: {
    external: ['react', 'react-dom', 'vue'],
    output: {
      experimentalMinChunkSize: 500,
    },
    treeshake: {
      preset: 'recommended',
      manualPureFunctions: ['console.log'],
    },
  },
  minify: 'terser',
};

export const umd: BuildOptions = {
  ...chunkOptimization,
  outDir: resolve(__dirname, 'dist/umd'),
  lib: {
    entry: resolve(__dirname, 'index.ts'),
    name: 'ranui',
    fileName: 'index',
    formats: ['umd'],
  },
};


export const es: BuildOptions = {
  ...chunkOptimization,
  lib: {
    entry: {
      preview: resolve(__dirname, 'components/preview/index.ts'),
      index: resolve(__dirname, 'index.ts'),
    },
    fileName: (_: string, name: string): string => {
      return `${name}.js`;
    },
    formats: ['es'],
  },
};

export const viteConfig: UserConfig = {
  optimizeDeps: {
    exclude: ['public'],
  },
  plugins: [
    loadStyle({
      ignore: ['ranui/components/modal/index.ts'],
    }),
    visualizer({
      emitFile: false,
      filename: 'report/build-stats.html',
    }) as PluginOption,
    babel({
      babelHelpers: 'bundled',
    }),
  ],
  resolve: {
    alias: {
      '@/components': resolve(__dirname, 'components/'),
      '@/assets': resolve(__dirname, 'assets/'),
      '@/public': resolve(__dirname, 'public/'),
      '@/utils': resolve(__dirname, 'utils/'),
    },
    extensions: ['.mjs', '.js', '.cjs', '.ts', '.jsx', '.tsx', '.json'],
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        additionalData: `@import "./base.less";`,
      },
    },
    modules: {
      generateScopedName: '[name--[local]--[hash:base64:5]]',
    },
  },
  server: {
    port: PORT,
  },
};

export default defineConfig(viteConfig);
