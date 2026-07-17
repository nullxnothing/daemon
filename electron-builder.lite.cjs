/**
 * Canonical DAEMON packaging for the focused agent workbench.
 * files is a computed WHITELIST (see scripts/lite-deps.cjs): only the runtime
 * dependency closure of the built focused bundles ships.
 */
const { liteExcludePatterns } = require('./scripts/lite-deps.cjs')

module.exports = {
  appId: 'com.daemon.app',
  productName: 'DAEMON',
  asar: true,
  npmRebuild: false,
  compression: 'maximum',
  directories: {
    output: 'release-lite/${version}',
  },
  extraMetadata: {
    name: 'daemon',
    main: 'dist-electron-lite/main/lite.js',
  },
  publish: [{ provider: 'github', owner: 'nullxnothing', repo: 'daemon' }],
  files: [
    'dist-electron-lite/**',
    'dist-lite/**',
    // electron-builder auto-collects the app's full prod dependency tree;
    // negate everything the lite bundles never import (computed complement).
    ...liteExcludePatterns(),
    '!node_modules/@types/**',
    // Keep better-sqlite3's built binary, drop its sources and vendored deps.
    '!node_modules/better-sqlite3/{deps,src}/**',
    '!node_modules/better-sqlite3/build/Release/{obj,sqlite3.a,test_extension.node}',
    '!**/*.map',
  ],
  electronLanguages: ['en-US'],
  asarUnpack: [
    'node_modules/better-sqlite3/**',
    'node_modules/node-pty/**',
  ],
  mac: {
    icon: 'build/icon.icns',
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    artifactName: 'DAEMON-${arch}.${ext}',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
  },
  afterSign: 'build/notarize.mjs',
  win: {
    icon: 'resources/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: 'DAEMON-setup.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
}
