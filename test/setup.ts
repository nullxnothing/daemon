import '@testing-library/jest-dom/vitest'
import { randomUUID, webcrypto } from 'node:crypto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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

afterEach(() => {
  cleanup()
})
