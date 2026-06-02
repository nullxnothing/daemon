import '@testing-library/jest-dom/vitest'
import { randomUUID, webcrypto } from 'node:crypto'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

const cryptoImpl = webcrypto as Crypto

if (!cryptoImpl.randomUUID) {
  Object.defineProperty(cryptoImpl, 'randomUUID', {
    configurable: true,
    value: randomUUID,
  })
}

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: cryptoImpl,
  })
}

function ensureLocalStorageClear() {
  if (typeof window === 'undefined' || !window.localStorage || typeof window.localStorage.clear === 'function') return
  const clear = () => {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key))
    keys.forEach((key) => window.localStorage.removeItem(key))
  }
  Object.defineProperty(Object.getPrototypeOf(window.localStorage), 'clear', {
    configurable: true,
    writable: true,
    value: clear,
  })
  Object.defineProperty(window.localStorage, 'clear', {
    configurable: true,
    writable: true,
    value: clear,
  })
}

beforeEach(() => {
  ensureLocalStorageClear()
})

afterEach(() => {
  cleanup()
})
