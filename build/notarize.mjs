import { notarize } from '@electron/notarize'
import { spawnSync } from 'node:child_process'

const REQUIRED_SIGNING_ENV_VARS = ['CSC_LINK', 'CSC_KEY_PASSWORD']
const REQUIRED_ENV_VARS = [
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]

function hasNotarizeEnv() {
  return REQUIRED_ENV_VARS.every((key) => Boolean(process.env[key]))
}

function isNotarizationRequired() {
  return process.env.DAEMON_REQUIRE_MAC_NOTARIZATION === '1'
}

function missingEnvVars(names) {
  return names.filter((key) => !process.env[key])
}

function assertDeveloperIdSignature(appPath) {
  const result = spawnSync('codesign', ['-dv', '--verbose=4', appPath], { encoding: 'utf8' })
  const details = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (result.status !== 0 || !details.includes('Authority=Developer ID Application:')) {
    throw new Error('macOS release is not signed with a Developer ID Application certificate')
  }
}

export default async function afterSign(context) {
  if (process.platform !== 'darwin') {
    return
  }

  const { appOutDir, electronPlatformName, packager } = context
  if (electronPlatformName !== 'darwin') {
    return
  }
  const appName = packager.appInfo.productFilename
  const appBundleId = packager.appInfo.id
  const appPath = `${appOutDir}/${appName}.app`

  if (!hasNotarizeEnv()) {
    if (isNotarizationRequired()) {
      throw new Error(`Missing required macOS notarization credentials: ${REQUIRED_ENV_VARS.join(', ')}`)
    }
    console.log('[notarize] Skipping notarization; missing Apple credentials in environment')
    return
  }

  if (isNotarizationRequired()) {
    const missingSigningVars = missingEnvVars(REQUIRED_SIGNING_ENV_VARS)
    if (missingSigningVars.length > 0) {
      throw new Error(`Missing required macOS signing credentials: ${missingSigningVars.join(', ')}`)
    }
    assertDeveloperIdSignature(appPath)
  }

  console.log(`[notarize] Submitting ${appName}.app for notarization`)

  await notarize({
    appBundleId,
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })

  console.log('[notarize] Notarization completed')
}
