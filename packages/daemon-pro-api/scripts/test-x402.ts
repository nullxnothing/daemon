import bs58 from 'bs58'
import { createKeyPairSignerFromBytes } from '@solana/kit'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { registerExactSvmScheme } from '@x402/svm/exact/client'

const TARGET_URL = process.env.DAEMON_PRO_TEST_URL ?? 'https://daemon-pro-api-production.up.railway.app/v1/subscribe'
const RAW_PRIVATE_KEY = process.env.DAEMON_PRO_TEST_PRIVATE_KEY ?? ''

function parseSecretKey(value: string): Uint8Array {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Missing DAEMON_PRO_TEST_PRIVATE_KEY. Use a funded Solana wallet for the test.')
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as number[]
    return Uint8Array.from(parsed)
  }

  return bs58.decode(trimmed)
}

async function main(): Promise<void> {
  const signer = await createKeyPairSignerFromBytes(parseSecretKey(RAW_PRIVATE_KEY))
  const client = new x402Client()
  registerExactSvmScheme(client, { signer })
  const httpClient = new x402HTTPClient(client)

  console.log(`[x402] requesting challenge from ${TARGET_URL}`)
  const challengeRes = await fetch(TARGET_URL, { method: 'POST' })
  const challengeBody = await challengeRes.json().catch(() => null)
  if (challengeRes.status !== 402) {
    throw new Error(`Expected 402 from subscribe endpoint, got ${challengeRes.status}: ${JSON.stringify(challengeBody)}`)
  }

  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => challengeRes.headers.get(name),
    challengeBody,
  )

  console.log('[x402] challenge received')
  console.log(JSON.stringify(paymentRequired, null, 2))

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload)

  console.log('[x402] retrying with payment signature header')
  const paidRes = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      ...paymentHeaders,
      'Content-Type': 'application/json',
    },
  })

  const paidBody = await paidRes.json().catch(() => null)
  console.log(`[x402] final status: ${paidRes.status}`)
  console.log(JSON.stringify(paidBody, null, 2))

  if (!paidRes.ok) {
    throw new Error(`Payment attempt failed with HTTP ${paidRes.status}`)
  }

  const settle = httpClient.getPaymentSettleResponse((name) => paidRes.headers.get(name))
  console.log('[x402] settlement response')
  console.log(JSON.stringify(settle, null, 2))
}

void main().catch((error) => {
  console.error('[x402] test failed')
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
