#!/usr/bin/env node
// Launcher for the bundled DAEMON bridge shim. The shim itself handles the
// "DAEMON app not running" case gracefully per call; this wrapper only guards
// the Node version and a broken install.
const MIN_NODE_MAJOR = 22

const nodeMajor = Number(process.versions.node.split('.')[0])
if (Number.isFinite(nodeMajor) && nodeMajor < MIN_NODE_MAJOR) {
  process.stderr.write(`[daemon-bridge-mcp] Node ${MIN_NODE_MAJOR}+ required (found ${process.versions.node}).\n`)
  process.exit(1)
}

import('./daemon-bridge-shim.mjs').catch((error) => {
  process.stderr.write(`[daemon-bridge-mcp] failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
  process.stderr.write('[daemon-bridge-mcp] The bundled shim could not be loaded. Reinstall the package, and make sure the DAEMON desktop app is installed: https://www.daemonide.tech\n')
  process.exit(1)
})
