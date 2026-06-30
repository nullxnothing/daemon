import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'

// CJS Solana/crypto deps (bn.js, noble-hashes) embed `require("buffer")` and read
// `.Buffer` off the result. In the ESM renderer that bare `require` is undefined and
// crashes the page (blank screen). renderChunk rewrites those calls to read the global
// Buffer, and tags the standalone buffer chunk to register that global on load (it is
// imported by — and therefore evaluated before — the consuming crypto chunks).
function bufferRequireShim() {
  const REQUIRE_BUFFER = /require\(\s*["']buffer["']\s*\)/g
  return {
    name: 'daemon-buffer-require-shim',
    renderChunk(code: string, chunk: { fileName: string }) {
      if (chunk.fileName.includes('buffer-polyfill')) {
        const ns = /export\s*\{\s*([\w$]+)\s+as\s+\w+\s*\}\s*;?\s*$/.exec(code.trim())?.[1]
        if (!ns) return null
        return { code: `${code}\ntry{globalThis.Buffer=globalThis.Buffer||${ns}.Buffer;globalThis.global=globalThis;}catch(e){}`, map: null }
      }
      if (!REQUIRE_BUFFER.test(code)) return null
      REQUIRE_BUFFER.lastIndex = 0
      return {
        code: code.replace(REQUIRE_BUFFER, '(globalThis.__daemonBuffer||(globalThis.__daemonBuffer={Buffer:globalThis.Buffer,SlowBuffer:globalThis.Buffer,default:globalThis.Buffer}))'),
        map: null,
      }
    },
  }
}

function electronCjsInteropShim() {
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

function rendererManualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
    if (id.includes('/language/typescript/') || id.includes('\\language\\typescript\\')) return 'monaco-typescript'
    if (id.includes('/language/json/') || id.includes('\\language\\json\\')) return 'monaco-json'
    if (id.includes('/language/css/') || id.includes('\\language\\css\\')) return 'monaco-css'
    if (id.includes('/language/html/') || id.includes('\\language\\html\\')) return 'monaco-html'
    if (id.includes('/basic-languages/') || id.includes('\\basic-languages\\')) return 'monaco-basic-languages'
    return 'monaco-core'
  }

  if (id.includes('@xterm')) return 'xterm'
  if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
  if (id.includes('zustand')) return 'state-vendor'
  // Isolate the buffer polyfill AND its deps (base64-js, ieee754) so the chunk is
  // self-contained — otherwise its deps land in `vendor`, creating a circular import
  // that defeats the load-order guarantee. It is imported (and evaluated) before the
  // crypto deps that read globalThis.Buffer.
  if (
    id.includes('/node_modules/buffer/') || id.includes('\\node_modules\\buffer\\') ||
    id.includes('/node_modules/base64-js/') || id.includes('\\node_modules\\base64-js\\') ||
    id.includes('/node_modules/ieee754/') || id.includes('\\node_modules\\ieee754\\')
  ) return 'buffer-polyfill'

  return 'vendor'
}

export default defineConfig(({ command }) => {
  rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  // All native + node dependencies must be external for electron main/preload
  const external = Object.keys('dependencies' in pkg ? pkg.dependencies : {})

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
        // CJS Solana/crypto deps (bn.js, noble-hashes) `require("buffer")`. By default
        // Vite resolves the `buffer` builtin to an empty stub in the renderer, so Buffer
        // is undefined and the renderer crashes (blank screen). Point it at the real
        // browser polyfill so the commonjs interop resolves a working Buffer.
        buffer: createRequire(import.meta.url).resolve('buffer/'),
      },
    },
    plugins: [
      electronCjsInteropShim(),
      bufferRequireShim(),
      react(),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log('[startup] DAEMON')
            } else {
              args.startup()
            }
          },
          vite: {
            plugins: [electronCjsInteropShim()],
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external,
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            plugins: [electronCjsInteropShim()],
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external,
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
      return {
        host: url.hostname,
        port: +url.port,
      }
    })(),
    clearScreen: false,
    // Crypto deps and the buffer polyfill reference `global`; map it to globalThis.
    define: {
      global: 'globalThis',
    },
    // Monaco bundles web workers internally — esbuild cannot pre-bundle it
    optimizeDeps: {
      exclude: ['monaco-editor'],
      // Pre-bundle the buffer polyfill so its CJS `require("buffer")` consumers resolve.
      include: ['buffer'],
    },
    worker: {
      format: 'es' as const,
    },
    build: {
      // DAEMON ships Monaco inside Electron, so Vite's 500 kB browser-page
      // default produces noise for the intentionally local editor bundle.
      chunkSizeWarningLimit: 4096,
      rollupOptions: {
        output: {
          manualChunks: rendererManualChunks,
        },
      },
    },
  }
})
