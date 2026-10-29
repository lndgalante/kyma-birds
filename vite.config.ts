import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Official TanStack Start + Cloudflare Workers recipe: the Cloudflare plugin owns the
// `ssr` environment, so dev, preview and the production build all run in workerd.
export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    // Vite 8 resolves tsconfig `paths` (the `~/*` alias) natively.
    tsconfigPaths: true,
  },
  build: {
    // The plate's WebGL chunk (three.js) is ~540 KB raw and lazily loaded; don't warn about it.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // Vite's own CSS plugin emits `?url` stylesheet stubs without a sourcemap in the
        // worker build. The warning is about Vite internals, not our code.
        if (warning.code === 'SOURCEMAP_BROKEN' && warning.plugin === 'vite:css-post') return
        defaultHandler(warning)
      },
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
