import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const mockDir = 'C:/Users/offic/Downloads/daemon6/design_handoff_daemon_migration/mockups'
const outDir = 'C:/Users/offic/Projects/DAEMON/test-results/ds-verify/mockups'
mkdirSync(outDir, { recursive: true })

const files = ['wallet.html', 'integrations.html', 'dashboard.html']
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } })
for (const f of files) {
  await page.goto(pathToFileURL(path.join(mockDir, f)).href, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const out = path.join(outDir, f.replace('.html', '.png'))
  await page.screenshot({ path: out, fullPage: true })
  console.log(`shot ${f}`)
}
await browser.close()
