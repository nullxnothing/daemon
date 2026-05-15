#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const expectedVersion = process.env.DAEMON_RELEASE_EXPECT_VERSION?.trim() || '4.0.0'
const repoRoot = process.cwd()

function fail(message) {
  console.error(`[v4-final-state] ${message}`)
  process.exit(1)
}

function readText(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8')
}

const pkg = JSON.parse(readText('package.json'))
if (pkg.version !== expectedVersion) {
  fail(`package.json version is ${pkg.version}; expected ${expectedVersion}.`)
}

const notes = readText('Whatsnew.md')
if (/release-candidate|do not tag|pre-live gates|rc\.?\d*/i.test(notes)) {
  fail('Whatsnew.md still contains RC/pre-live wording.')
}

const cloudClient = readText('electron/services/DaemonAICloudClient.ts')
if (/daemon-ai-cloud-v4-staging\.onrender\.com|DAEMON_AI_STAGING_API_BASE/.test(cloudClient)) {
  fail('Desktop DAEMON AI Cloud fallback still points at staging. Configure the production default cloud URL before final release.')
}

const proService = readText('electron/services/ProService.ts')
if (/daemon-pro-api-production\.up\.railway\.app/.test(proService)) {
  fail('Desktop Pro subscription API fallback still points at Railway. Configure it to use the production DAEMON AI Cloud URL.')
}

const status = execFileSync('git', ['status', '--porcelain'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim()
if (status) {
  fail('Git worktree is not clean. Commit or intentionally exclude all release changes before tagging.')
}

const releaseDir = path.join(repoRoot, 'release', expectedVersion)
const installer = path.join(releaseDir, 'DAEMON-setup.exe')
const latestYml = path.join(releaseDir, 'latest.yml')
for (const artifact of [installer, latestYml]) {
  if (!fs.existsSync(artifact)) {
    fail(`Missing release artifact: ${path.relative(repoRoot, artifact)}`)
  }
}

console.log(`[v4-final-state] passed version=${expectedVersion}`)
