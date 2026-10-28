import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Plate lab: <CymaticsPlate> in a real browser with a controllable drive (no Cloudflare/TanStack plugins).
//   pnpm vite --config src/cymatics/__harness__/vite.config.ts
const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: here,
  publicDir: resolve(here, '../../../public'),
  resolve: { alias: { '~': resolve(here, '../..') } },
  plugins: [viteReact()],
  server: { port: 3102, strictPort: true },
  logLevel: 'warn',
})
