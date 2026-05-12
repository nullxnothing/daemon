import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'
import pkg from './package.json'

const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  ...Object.keys(pkg.dependencies ?? {}),
]

export default defineConfig({
  build: {
    target: 'node20',
    ssr: 'electron/services/daemon-ai-cloud/server.ts',
    outDir: 'dist-cloud',
    emptyOutDir: true,
    rollupOptions: {
      external,
      output: {
        format: 'es',
        entryFileNames: 'daemon-ai-cloud-server.mjs',
      },
    },
  },
})
