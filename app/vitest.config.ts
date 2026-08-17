// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts?(x)', '../collector/**/*.{test,spec}.ts?(x)'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
