import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyMacRelease } from '../../scripts/release-tools/verify-macos-artifacts.mjs'

const VERSION = '4.8.0'
let releaseDir = ''

function sha512(contents: string) {
  return createHash('sha512').update(contents).digest('base64')
}

function writeFixture(isUnsigned = false) {
  releaseDir = mkdtempSync(path.join(tmpdir(), 'daemon-mac-release-'))
  const prefix = isUnsigned ? 'DAEMON-unsigned-arm64' : 'DAEMON-arm64'
  const artifacts = {
    [`${prefix}.dmg`]: 'dmg-contents',
    [`${prefix}.zip`]: 'zip-contents',
  }
  for (const [name, contents] of Object.entries(artifacts)) {
    writeFileSync(path.join(releaseDir, name), contents)
    writeFileSync(path.join(releaseDir, `${name}.blockmap`), 'blockmap')
  }
  writeFileSync(path.join(releaseDir, 'latest-mac.yml'), [
    `version: ${VERSION}`,
    'files:',
    `  - url: ${prefix}.zip`,
    `    sha512: ${sha512(artifacts[`${prefix}.zip`])}`,
    `    size: ${artifacts[`${prefix}.zip`].length}`,
    `  - url: ${prefix}.dmg`,
    `    sha512: ${sha512(artifacts[`${prefix}.dmg`])}`,
    `    size: ${artifacts[`${prefix}.dmg`].length}`,
    `path: ${prefix}.zip`,
  ].join('\n'))
}

afterEach(() => {
  if (releaseDir) rmSync(releaseDir, { recursive: true, force: true })
  releaseDir = ''
})

describe('macOS release artifacts', () => {
  it('accepts matching arm64 artifacts and updater metadata', () => {
    writeFixture()
    expect(() => verifyMacRelease(releaseDir, VERSION)).not.toThrow()
  })

  it('accepts explicitly labeled unsigned artifacts only in unsigned mode', () => {
    writeFixture(true)
    expect(() => verifyMacRelease(releaseDir, VERSION, { isUnsigned: true })).not.toThrow()
    expect(() => verifyMacRelease(releaseDir, VERSION)).toThrow(/DAEMON-arm64/)
  })

  it('rejects metadata with a mismatched artifact hash', () => {
    writeFixture()
    writeFileSync(path.join(releaseDir, 'DAEMON-arm64.zip'), 'tampered')
    expect(() => verifyMacRelease(releaseDir, VERSION)).toThrow(/size does not match/)
  })

  it('rejects non-arm64 updater entries', () => {
    writeFixture()
    const metadataPath = path.join(releaseDir, 'latest-mac.yml')
    writeFileSync(metadataPath, `${readFileSync(metadataPath, 'utf8')}\n  - url: DAEMON-x64.zip\n`)
    expect(() => verifyMacRelease(releaseDir, VERSION)).toThrow(/non-arm64 artifact/)
  })
})
