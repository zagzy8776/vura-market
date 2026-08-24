import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // Run without a browser — the handlers talk to the (mocked) datastore.
    restoreMocks: true,
  },
});
