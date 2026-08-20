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
      // index.ts is the server bootstrap (listen + signal handlers). Tests drive
      // src/app.ts instead, so counting it would just depress the numbers.
      exclude: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed.ts', 'src/scripts/**'],
    },
    // Separate test pools for unit vs integration
    fileParallelism: false, // integration tests share DB state
  },
});
