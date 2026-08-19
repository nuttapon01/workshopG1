import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/db/migrate.ts', 'src/db/seed.ts', 'src/scripts/**'],
    },
    // Separate test pools for unit vs integration
    fileParallelism: false, // integration tests share DB state
  },
});
