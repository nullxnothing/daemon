import { Transaction, VersionedTransaction } from '@solana/web3.js'
import type { WalletAdapterTransaction } from './types'

// A serialized transaction begins with a compact-u16 signature count followed
// by that many 64-byte signatures; only after them does the message start, and
// only the message's first byte carries the version marker (high bit set = v0+).
// Skip the signatures to read that marker so v0 txns (e.g. Jupiter swaps) parse
// as versioned while legacy txns parse as legacy.
export function deserializeTransaction(bytes: Uint8Array): WalletAdapterTransaction {
  const { value: signatureCount, length: prefixLength } = decodeCompactU16(bytes)
  const messageOffset = prefixLength + signatureCount * 64
  const isVersioned = (bytes[messageOffset] & 0x80) !== 0
  return isVersioned ? VersionedTransaction.deserialize(bytes) : Transaction.from(bytes)
}

// Solana's compact-u16 (shortvec) encoding: 7 bits per byte, high bit = continue.
function decodeCompactU16(bytes: Uint8Array): { value: number; length: number } {
  let value = 0
  let length = 0
  for (;;) {
    const byte = bytes[length]
    value |= (byte & 0x7f) << (length * 7)
    length += 1
    if ((byte & 0x80) === 0) break
  }
  return { value, length }
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return window.btoa(binary)
}
