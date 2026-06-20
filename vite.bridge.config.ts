import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Unlike vite.cloud.config.ts, dependencies are NOT external: the shim must be
// a single self-contained .mjs the system node can run from app resources,
// so the MCP SDK is bundled in. Only node builtins stay external.
const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]

export default defineConfig({
  ssr: {
    // Bundle the MCP SDK (and everything else) — only node builtins stay external.
    noExternal: true,
  },
  build: {
    target: 'node18',
    ssr: 'electron/services/bridge/shim.ts',
    outDir: 'dist-bridge',
    emptyOutDir: true,
    rollupOptions: {
      external,
      output: {
        format: 'es',
        entryFileNames: 'daemon-bridge-shim.mjs',
        inlineDynamicImports: true,
      },
    },
  },
})
