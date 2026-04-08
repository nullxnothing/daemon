import { notarize } from '@electron/notarize'

const REQUIRED_ENV_VARS = [
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
]

function hasNotarizeEnv() {
  return REQUIRED_ENV_VARS.every((key) => Boolean(process.env[key]))
}

export default async function afterSign(context) {
  if (process.platform !== 'darwin') {
    return
  }

  if (!hasNotarizeEnv()) {
    console.log('[notarize] Skipping notarization; missing Apple credentials in environment')
    return
  }

  const { appOutDir, electronPlatformName, packager } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  const appName = packager.appInfo.productFilename
  const appBundleId = packager.appInfo.id

  console.log(`[notarize] Submitting ${appName}.app for notarization`)

  await notarize({
    appBundleId,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })

  console.log('[notarize] Notarization completed')
}
