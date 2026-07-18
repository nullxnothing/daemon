const SIGNED_ENTITLEMENTS = 'build/entitlements.mac.plist'
const ADHOC_ENTITLEMENTS = 'build/entitlements.mac.adhoc.plist'

function macSigningConfig(env = process.env) {
  const isAdHoc = env.DAEMON_MAC_ADHOC === '1'
  return {
    isAdHoc,
    identity: isAdHoc ? '-' : undefined,
    entitlements: isAdHoc ? ADHOC_ENTITLEMENTS : SIGNED_ENTITLEMENTS,
    artifactName: isAdHoc ? 'DAEMON-unsigned-${arch}.${ext}' : 'DAEMON-${arch}.${ext}',
  }
}

module.exports = { macSigningConfig }
