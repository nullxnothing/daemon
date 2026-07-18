/**
 * DAEMON Lite build — second flavor of the app from the same repo.
 * Renderer: lite.html → dist-lite. Main: electron/main/lite.ts →
 * dist-electron-lite. Preload is shared with the full app.
 *
 * The module-swap plugin is the size lever: it redirects toolCatalog and
 * contextAssembler to their .lite variants so the main bundle never imports
 * the IDE/Solana tool domains (raydium, metaplex, launchpads, ...), letting
 * electron-builder.lite.json exclude those packages from the installer.
 */
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

const LITE_MODULE_SWAPS: Array<{ match: RegExp; file: string }> = [
  { match: /electron[\\/]services[\\/]aria[\\/]toolCatalog(\.ts)?$/, file: 'electron/services/aria/toolCatalog.lite.ts' },
  { match: /electron[\\/]services[\\/]aria[\\/]contextAssembler(\.ts)?$/, file: 'electron/services/aria/contextAssembler.lite.ts' },
  { match: /electron[\\/]services[\\/]ProService(\.ts)?$/, file: 'electron/services/ProService.lite.ts' },
  { match: /electron[\\/]services[\\/]email[\\/]EmailTools(\.ts)?$/, file: 'electron/services/email/EmailTools.lite.ts' },
  { match: /electron[\\/]ipc[\\/]forensics(\.ts)?$/, file: 'electron/ipc/forensics.lite.ts' },
]

function liteModuleSwap(): Plugin {
  return {
    name: 'daemon-lite-module-swap',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null
      // The .lite variants import shared modules from the same directory —
      // never rewrite resolutions requested by the swapped files themselves.
      if (/\.lite\.ts$/.test(importer)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved || resolved.id.includes('.lite.')) return null
      for (const swap of LITE_MODULE_SWAPS) {
        if (swap.match.test(resolved.id)) return path.join(__dirname, swap.file)
      }
      return null
    },
  }
}

function electronCjsInteropShim(): Plugin {
  const ELECTRON_NAMED_IMPORT = /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']electron["'];?/g
  return {
    name: 'daemon-electron-cjs-interop',
    renderChunk(code: string) {
      if (!ELECTRON_NAMED_IMPORT.test(code)) return null
      ELECTRON_NAMED_IMPORT.lastIndex = 0
      return {
        code: code.replace(ELECTRON_NAMED_IMPORT, (_match, names: string) => {
          const imports = names
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => {
              const [source, alias] = name.split(/\s+as\s+/)
              return alias ? `${source}: ${alias}` : source
            })
            .join(', ')

          return `import electron from "electron";\nconst { ${imports} } = electron;`
        }),
        map: null,
      }
    },
  }
}

function liteRendererChunks(id: string) {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
  if (id.includes('zustand')) return 'state-vendor'
  return 'vendor'
}

export default defineConfig(({ command }) => {
  rmSync('dist-electron-lite', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe

  const external = Object.keys('dependencies' in pkg ? pkg.dependencies : {})

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
        buffer: createRequire(import.meta.url).resolve('buffer/'),
      },
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main/lite.ts',
          onstart(args) {
            // Default startup() runs `electron .` which boots the FULL app via
            // package.json "main". Point electron at the lite main explicitly.
            args.startup(['dist-electron-lite/main/lite.js'])
          },
          vite: {
            plugins: [liteModuleSwap(), electronCjsInteropShim()],
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron-lite/main',
              rollupOptions: {
                external,
              },
            },
          },
        },
        preload: {
          // Two preloads: the shared full bridge (main window) and the minimal
          // pop-out bridge (chrome strip — nav channels only).
          input: {
            index: 'electron/preload/index.ts',
            popout: 'electron/preload/popout.ts',
          },
          vite: {
            plugins: [electronCjsInteropShim()],
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron-lite/preload',
              rollupOptions: {
                external,
                output: {
                  // Two preload inputs → per-input chunks; disable the plugin's
                  // default single-file inlining which rejects multiple inputs.
                  inlineDynamicImports: false,
                },
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    clearScreen: false,
    define: {
      global: 'globalThis',
    },
    optimizeDeps: {
      include: ['buffer'],
    },
    build: {
      outDir: 'dist-lite',
      chunkSizeWarningLimit: 2048,
      rollupOptions: {
        // Two renderer entries: the app shell and the pop-out chrome strip.
        input: {
          lite: path.join(__dirname, 'lite.html'),
          popout: path.join(__dirname, 'popout.html'),
        },
        output: {
          manualChunks: liteRendererChunks,
        },
      },
    },
  }
})
