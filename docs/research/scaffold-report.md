The skeleton is scaffolded in `/Users/leo/Developer/kyma-birds` and builds and serves on workerd locally. Install, typecheck, test, build, preview, deploy dry-run and dev all passed, and I killed every server afterwards. I did not open the page in a browser, so the WebGPU canvas has only been checked as bundled code, not seen rendering. Nothing is committed.

## Installed versions (all latest)
- **Dependencies:** @tanstack/react-router 1.170.46, @tanstack/react-start 1.169.4, react and react-dom 19.3.1, three 0.186.1.
- **Dev dependencies:** @cloudflare/vite-plugin 1.65.0, wrangler 4.154.0, vite 8.3.5, @vitejs/plugin-react 6.1.2, vitest 5.0.5, typescript 7.0.2 (the new native compiler), prettier 3.9.10, @types/react and @types/react-dom 19.3.0, @types/three 0.186.0, @types/node 24.19.2.
- **Vite 8 works with everything:** react-start needs vite >=8.0.0, the Cloudflare plugin accepts ^6, ^7 or ^8, plugin-react 6 needs ^8, and vitest 5 accepts ^6.4, ^7 or ^8.
- **Runtime:** workerd 2026-10-19 runs dev and preview; wrangler's own workerd is 1.20261023.1.

## Recipe source
- The setup follows the TanStack hosting docs, the official `examples/react/start-basic-cloudflare` project (fetched from raw GitHub), the Cloudflare TanStack Start guide, and the wrangler skill.
- The Cloudflare plugin uses the `ssr` environment, the worker entry is `@tanstack/react-start/server-entry`, and preview is `vite preview`.

## Final files
`/Users/leo/Developer/kyma-birds/vite.config.ts`
```ts
export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true }, // Vite 8 native, handles the "~/*" alias
  build: {
    chunkSizeWarningLimit: 1200, // three/webgpu is one ~1.1 MB lazily loaded chunk
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'SOURCEMAP_BROKEN' && warning.plugin === 'vite:css-post') return
        defaultHandler(warning)
      },
    },
  },
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), viteReact()],
})
```
`/Users/leo/Developer/kyma-birds/wrangler.jsonc`
```jsonc
{ "$schema": "node_modules/wrangler/config-schema.json", "name": "kyma-birds",
  "compatibility_date": "2026-10-19", "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry", "observability": { "enabled": true } }
```
`/Users/leo/Developer/kyma-birds/src/router.tsx`
```tsx
export function getRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent', defaultNotFoundComponent: NotFound, scrollRestoration: true })
}
```
- There is no manual `Register` block: the generated `routeTree.gen.ts` declares `@tanstack/react-start` `Register { ssr: true; router }` itself.

`/Users/leo/Developer/kyma-birds/src/routes/__root.tsx`
- Imports `globalCss from '~/styles/global.css?url'`.
- `createRootRoute` has a `head()` with charset, viewport (`width=device-width, initial-scale=1, viewport-fit=cover`), title "Kyma Birds", description and color-scheme.
- Links: the stylesheet `{ rel: 'stylesheet', href: globalCss }` and the icon `/favicon.svg`.
- Uses `shellComponent: RootDocument`, which renders `<html lang="en">` with `<HeadContent/>`, then the children and `<Scripts/>`.

`package.json` scripts:
- `dev`: `vite dev`
- `build`: `vite build`
- `preview`: `vite preview`
- `deploy`: `pnpm run build && wrangler deploy`
- `typecheck`: `tsc --noEmit`
- `test`: `vitest run`
- `format` / `format:check`: Prettier
- `cf-typegen`: `wrangler types`
- `postinstall`: `WRANGLER_LOG=warn pnpm run --silent cf-typegen`, as in the official example

The package also declares `packageManager: pnpm@12.14.0` and `engines.node >=22.12.0`.

**Other files:**
- **Config:** `tsconfig.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `.gitignore`, `.prettierrc.json` (your exact settings), `.prettierignore`.
- **Source:** `src/routes/index.tsx` (the `<h1>` plus `<ThreeProbe/>`), `src/components/ThreeProbe.tsx`, `src/components/NotFound.tsx`, `src/lib/site.ts`, `src/lib/__tests__/smoke.test.ts`, `src/styles/global.css`.
- **Static:** `public/favicon.svg`.

## Client-only mechanisms in this version
I confirmed each of these in `node_modules`:
1. **`<ClientOnly fallback>` and `useHydrated()`** from @tanstack/react-router. The Start compiler also removes `<ClientOnly>` children from the server build. **Used.**
2. **`createClientOnlyFn(fn)`** from @tanstack/react-start. On the server, the compiler swaps it for a stub that throws, so any `import()` inside it is stripped. **Used**, as `const loadThree = createClientOnlyFn(() => import('three/webgpu'))`, called inside `useEffect`.
3. **Route-level `ssr: false | 'data-only'`**, or `defaultSsr` in `createStart`. Not used.
4. **`import '@tanstack/react-start/client-only'`**: a marker import that makes importing the module from the server an error. Not used.

How the probe works:
- It creates `new THREE.WebGPURenderer()` and awaits `init()`.
- The mesh is an `IcosahedronGeometry` with a wireframe `MeshBasicNodeMaterial`.
- A label shows "WebGPU" or "WebGL2" depending on the backend that started.
- Cleanup on unmount: a `disposed` flag that is StrictMode-safe, `setAnimationLoop(null)`, ResizeObserver disconnect, disposing the geometry, material and renderer, and removing the canvas.
- It does not rotate when the user prefers reduced motion.

**Bundle proof:**
- The server route chunk contains only `<ClientOnly fallback=…/>`.
- No three.js code is in `dist/server`; the only match for "WebGPURenderer" there is a doc comment.
- The client gets a separate lazy chunk, `three.webgpu-*.js` (1,076 kB, 294 kB gzip), loaded via `import("./three.webgpu-…js")`.

## How CSS and public assets are served
- **CSS:** the `?url` import becomes a hashed file, `/assets/global-<hash>.css`, linked from `head()`. In dev it is `/src/styles/global.css`, plus a dev-only `/@tanstack-start/styles.css`.
- **Public files:** `public/` is copied to `dist/client`.
- **Assets binding:** the build writes `dist/server/wrangler.json` with `"assets": {"directory": "../client"}` and `"main": "index.js"`.
- **What wrangler reads:** at deploy it uses that redirected config automatically.
- **Excluded from upload:** `dist/client/.assetsignore` keeps `wrangler.json` and `.dev.vars` out of the assets.

## Gotchas and fixes
- **pnpm 12 build scripts:** `onlyBuiltDependencies` was removed in pnpm 11. Builds are now approved with `allowBuilds` in `pnpm-workspace.yaml`, and `strictDepBuilds` (default true) fails the install on any unreviewed package. I set esbuild and workerd to true and sharp to false; sharp comes in through miniflare and uses prebuilt binaries.
- **pnpm minimum release age:** pnpm won't install versions younger than 1440 minutes by default. wrangler 4.154.0 and miniflare 5.20261023.1-beta came out today, so pnpm added a `minimumReleaseAgeExclude` entry for them to `pnpm-workspace.yaml` itself. I added a comment explaining it.
- **pnpm "Agent skills awaiting approval":** pnpm prints this for @tanstack/react-router and @tanstack/react-start. It is only a notice and doesn't block the install. I did not approve them.
- **Two workerd versions:** the Cloudflare Vite plugin pins miniflare 5.20261019.2-beta, whose workerd only supports dates up to 2026-10-19. I set `compatibility_date` to `2026-10-19` so dev and preview don't fall back to an older date with a warning.
- **TypeScript 7:** the official example aliases `typescript` to TS6, but nothing in this dependency tree needs the old TypeScript JS API (`pnpm why typescript` shows only the root package). TS 6+ no longer loads `@types` packages automatically, so I listed `types: ["vite/client"]` explicitly. There is no `baseUrl`, which TS7 removed; `paths` works without it. Strict mode catches errors: a deliberate bad file gave TS2322 and TS7006 with exit code 1.
- **Generated Cloudflare types:** `worker-configuration.d.ts` (626 KB) is regenerated on every install by postinstall, so I gitignored it. Its runtime types sit alongside the DOM types without errors.
- **Route tree:** `src/routeTree.gen.ts` is generated on the first dev or build run and `tsc` needs it. It is not gitignored, so commit it with the rest; Prettier skips it.
- **Two build warnings, both handled:** the chunk-size warning for the lazy three.js chunk is raised to 1200 kB, and an internal Vite `SOURCEMAP_BROKEN` warning about the `?url` stylesheet stub is filtered narrowly. Builds are now warning-free.
- **Separate test config:** `vitest.config.ts` exists so unit tests run in plain Node without starting workerd.
- **`sideEffects: false`:** the example sets this, but I removed it because in an app it could drop modules that are imported only for their side effects.
- **Stopping servers:** `pkill -f "vite preview"` didn't match because the process is `vite.js preview`, so I killed by the PID on the port plus the workerd child. A final check found no vite, workerd or wrangler processes left.

## Verification output (trimmed)
- **`CI=true pnpm install`:** "Packages: +175 … esbuild/workerd postinstall: Done … . postinstall: Done … Done in 1m 35.3s using pnpm v12.14.0". A fresh `rm -rf node_modules` followed by `--frozen-lockfile` also exited 0.
- **`pnpm typecheck`:** `tsc --noEmit`, exit 0, 11 project files checked.
- **`pnpm test`:** "Test Files 1 passed (1) / Tests 1 passed (1)". The test imports through the `~` alias.
- **`pnpm build`:** the client has `index-*.js` at 340.97 kB and `three.webgpu-*.js` at 1,076.24 kB. The server is `dist/server/index.js` at 759.29 kB plus `wrangler.json`. Both builds said "✓ built" with no warnings.
- **`pnpm preview --port 4173`:**
  - `GET /` returned 200 text/html. It contains `<title>Kyma Birds</title>`, `<h1>Kyma Birds</h1>`, the `/assets/global-JF1ZbqHz.css` link, and the fallback "Renderer loads in the browser".
  - `/favicon.svg` returned 200 image/svg+xml.
  - The CSS returned 200 text/css.
  - `/assets/index-DNkDoL91.js` and `/assets/routes-*.js` returned 200 text/javascript.
  - The three.webgpu chunk returned 200.
  - `/does-not-exist` returned 404 with the NotFound page.
  - The server was then killed and port 4173 is free.
- **`pnpm wrangler deploy --dry-run`:** "Using redirected Wrangler configuration … dist/server/wrangler.json", 7 modules (190.14 KiB), "Read 7 files from the assets directory …/dist/client", "Total Upload: 931.64 KiB / gzip: 203.68 KiB", "--dry-run: exiting now.", exit 0. I did not log in.
- **`pnpm dev`:** "VITE v8.3.5 ready in 1477 ms", `GET /` returned 200 with the title and `<h1>Kyma Birds</h1>`, and `/favicon.svg` returned 200. The server was killed and port 3000 is free.

## Repo changes
- `README.md` only gained a trailing newline from Prettier.
- `dist/` and `.wrangler/` are left behind as gitignored build output.

Sources: [TanStack Start hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting), [TanStack start-basic-cloudflare example](https://github.com/TanStack/router/tree/main/examples/react/start-basic-cloudflare), [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/), [pnpm build settings](https://pnpm.io/settings/build), [pnpm dependency-resolution settings](https://pnpm.io/settings/dependency-resolution), [TS 6 default changes (LogRocket)](https://blog.logrocket.com/typescript-v6-migration-guide/), [TS 6 defaults (dev.to)](https://dev.to/gabrielanhaia/5-typescript-defaults-that-quietly-changed-in-2026-and-why-your-build-is-now-broken-381f)