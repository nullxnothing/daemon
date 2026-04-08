import { config } from './config.js'
import { createApp } from './index.js'
import { initializeSubscribePayments } from './lib/x402.js'

await initializeSubscribePayments()

const app = createApp()
app.listen(config.port, () => {
  console.log(`[daemon-pro-api] listening on :${config.port} (${config.nodeEnv})`)
  console.log(`[daemon-pro-api] network: ${config.network}`)
  console.log(`[daemon-pro-api] price:   ${config.priceUsdc} USDC / ${config.durationDays}d`)
})
