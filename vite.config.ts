import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const r = (p: string) => resolve(root, p);

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': r('src'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      input: {
        viewer: r('index.html'),
        bench: r('bench.html'),
      },
    },
  },
  define: {
    __DEV__: JSON.stringify(mode !== 'production'),
  },
  server: {
    port: 5173,
    strictPort: false,
  },
}));
