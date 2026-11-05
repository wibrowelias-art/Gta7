import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: { main: 'index.html', hq: 'hq.html' },
      output: {
        manualChunks(id: string) {
          if (id.includes('pixi-filters')) return 'pixi-filters';
          if (id.includes('pixi.js')) return 'pixi';
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
} as any);
