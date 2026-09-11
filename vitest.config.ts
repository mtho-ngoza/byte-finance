import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./__tests__/vitest.setup.ts'],
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'lib/**/*.ts',
        'app/api/**/*.ts',
      ],
      exclude: [
        'node_modules',
        '__tests__',
        '**/*.d.ts',
        'lib/firebase.ts',
        'lib/firebase-admin.ts',
      ],
      thresholds: {
        // TODO: Increase these as coverage improves - target 80%
        // Current: ~10%, Next milestone: 30%
        lines: 10,
        functions: 10,
        branches: 5,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
