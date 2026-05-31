// Renderer polyfills — imported first in main.tsx, before any other module.
//
// Several Solana/crypto dependencies (noble-hashes, bn.js, etc.) expect a Node-style
// global `Buffer`. In the Electron renderer (ESM) it is otherwise undefined, which
// crashes the renderer (blank screen). Register the browser polyfill globally.
import { Buffer } from 'buffer'

const scope = globalThis as unknown as { Buffer?: typeof Buffer; global?: typeof globalThis }
if (!scope.Buffer) scope.Buffer = Buffer
if (!scope.global) scope.global = globalThis

export {}
