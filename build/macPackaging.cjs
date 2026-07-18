const SIGNED_ENTITLEMENTS = 'build/entitlements.mac.plist'

function macSigningConfig(env = process.env) {
  const isAdHoc = env.DAEMON_MAC_ADHOC === '1'
  return {
    isAdHoc,
    identity: isAdHoc ? '-' : undefined,
    hardenedRuntime: !isAdHoc,
    entitlements: isAdHoc ? undefined : SIGNED_ENTITLEMENTS,
    artifactName: isAdHoc ? 'DAEMON-unsigned-${arch}.${ext}' : 'DAEMON-${arch}.${ext}',
  }
}

module.exports = { macSigningConfig }
