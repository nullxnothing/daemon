import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function macArtifacts(isUnsigned) {
  const prefix = isUnsigned ? 'DAEMON-unsigned-arm64' : 'DAEMON-arm64'
  return [`${prefix}.dmg`, `${prefix}.zip`]
}

function fail(message) {
  throw new Error(`[mac-release] ${message}`)
}

function sha512(filePath) {
  return createHash('sha512').update(readFileSync(filePath)).digest('base64')
}

function metadataEntry(metadata, artifactName) {
  const escapedName = artifactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = metadata.match(
    new RegExp(`- url: ${escapedName}\\r?\\n\\s+sha512: ([^\\r\\n]+)\\r?\\n\\s+size: (\\d+)`),
  )
  if (!match) fail(`latest-mac.yml is missing ${artifactName}`)
  return { sha512: match[1].trim(), size: Number(match[2]) }
}

export function verifyMacRelease(releaseDir, expectedVersion, { isUnsigned = false } = {}) {
  const artifacts = macArtifacts(isUnsigned)
  const zipName = artifacts.find((name) => name.endsWith('.zip'))
  const metadataPath = path.join(releaseDir, 'latest-mac.yml')
  if (!existsSync(metadataPath)) fail(`missing ${metadataPath}`)

  const metadata = readFileSync(metadataPath, 'utf8')
  if (!metadata.includes(`version: ${expectedVersion}`)) {
    fail(`latest-mac.yml version does not match ${expectedVersion}`)
  }
  if (!metadata.includes(`path: ${zipName}`)) {
    fail(`latest-mac.yml updater path is not ${zipName}`)
  }
  if (/DAEMON-(?:unsigned-)?(?:x64|universal)\.(?:dmg|zip)/.test(metadata)) {
    fail('latest-mac.yml contains a non-arm64 artifact')
  }

  for (const artifactName of artifacts) {
    const artifactPath = path.join(releaseDir, artifactName)
    const blockmapPath = `${artifactPath}.blockmap`
    if (!existsSync(artifactPath)) fail(`missing ${artifactPath}`)
    if (!existsSync(blockmapPath)) fail(`missing ${blockmapPath}`)

    const entry = metadataEntry(metadata, artifactName)
    if (entry.size !== statSync(artifactPath).size) {
      fail(`${artifactName} size does not match latest-mac.yml`)
    }
    if (entry.sha512 !== sha512(artifactPath)) {
      fail(`${artifactName} sha512 does not match latest-mac.yml`)
    }
  }

  console.log(`[mac-release] verified ${expectedVersion} arm64 DMG, ZIP, blockmaps, and updater metadata`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const releaseDir = path.resolve(process.argv[2] ?? '')
  const expectedVersion = process.argv[3]
  const flags = process.argv.slice(4)
  if (!process.argv[2] || !expectedVersion || flags.some((flag) => flag !== '--unsigned') || flags.length > 1) {
    fail('usage: verify-macos-artifacts.mjs <release-dir> <version> [--unsigned]')
  }
  verifyMacRelease(releaseDir, expectedVersion, { isUnsigned: flags[0] === '--unsigned' })
}
