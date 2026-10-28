import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Stand-alone harness for the audio engine in a real browser (no Cloudflare/TanStack plugins):
//   pnpm vite --config src/audio/engine/__harness__/vite.config.ts
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../../public', import.meta.url)),
  resolve: { tsconfigPaths: true },
  server: { port: 3101, strictPort: true },
  logLevel: 'warn',
})
