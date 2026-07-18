/**
 * Canonical DAEMON packaging for the focused agent workbench.
 * Runtime dependencies are installed into an isolated, hoisted staging app
 * before packaging so pnpm's version-specific dependency graph stays intact.
 */
const path = require('node:path')
const { macSigningConfig } = require('./build/macPackaging.cjs')
const macSigning = macSigningConfig()

module.exports = {
  appId: 'com.daemon.app',
  productName: 'DAEMON',
  asar: true,
  beforeBuild: async () => false,
  compression: macSigning.isAdHoc ? 'normal' : 'maximum',
  directories: {
    app: 'release-lite/.stage',
    output: 'release-lite/${version}',
  },
  extraMetadata: {
    name: 'daemon',
    main: 'dist-electron-lite/main/lite.js',
  },
  extraResources: macSigning.isAdHoc
    ? [{ from: path.join(__dirname, 'build/macos-adhoc-release'), to: 'macos-adhoc-release' }]
    : undefined,
  publish: [{ provider: 'github', owner: 'nullxnothing', repo: 'daemon' }],
  files: [
    'dist-electron-lite/**',
    'dist-lite/**',
    '!**/*.map',
    {
      from: path.join(__dirname, 'release-lite/.stage/node_modules'),
      to: 'node_modules',
      filter: [
        '**/*',
        '!@types{,/**/*}',
        '!**/.bin{,/**/*}',
        '!**/*.map',
        '!better-sqlite3/{deps,src}/**',
        '!better-sqlite3/build/Release/{obj,sqlite3.a,test_extension.node}',
      ],
    },
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
    artifactName: macSigning.artifactName,
    identity: macSigning.identity,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: false,
    entitlements: macSigning.entitlements,
    entitlementsInherit: macSigning.entitlements,
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
