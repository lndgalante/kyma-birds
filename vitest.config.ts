import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so unit tests run in plain Node, without the
// Cloudflare (workerd) and TanStack Start plugins.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
