import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('daemon', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    reload: () => ipcRenderer.send('window:reload'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => {
      const onMax = () => callback(true)
      const onUnmax = () => callback(false)
      ipcRenderer.on('window:maximized', onMax)
      ipcRenderer.on('window:unmaximized', onUnmax)
      return () => {
        ipcRenderer.off('window:maximized', onMax)
        ipcRenderer.off('window:unmaximized', onUnmax)
      }
    },
  },

  terminal: {
    create: (opts?: { cwd?: string; startupCommand?: string; userInitiated?: boolean; isAgent?: boolean }) => ipcRenderer.invoke('terminal:create', opts ?? {}),
    spawnAgent: (opts: { agentId: string; projectId: string; initialPrompt?: string }) => ipcRenderer.invoke('terminal:spawnAgent', opts),
    spawnProvider: (opts: { providerId: 'claude' | 'codex'; projectId?: string; cwd?: string }) => ipcRenderer.invoke('terminal:spawnProvider', opts),
    ready: (id: string) => ipcRenderer.send('terminal:ready', id),
    write: (id: string, data: string) => ipcRenderer.send('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    checkClaude: () => ipcRenderer.invoke('terminal:check-claude'),
    checkCodex: () => ipcRenderer.invoke('terminal:check-codex'),
    pasteFromClipboard: (id: string) => ipcRenderer.invoke('terminal:paste-from-clipboard', id),
    onData: (callback: (payload: { id: string; data: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) => callback(payload)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.off('terminal:data', handler)
    },
    onExit: (callback: (payload: { id: string; exitCode: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; exitCode: number }) => callback(payload)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.off('terminal:exit', handler)
    },
  },

  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    claudeList: () => ipcRenderer.invoke('agents:claude-list'),
    importClaude: (filePath: string) => ipcRenderer.invoke('agents:import-claude', filePath),
    syncClaude: (filePath: string) => ipcRenderer.invoke('agents:sync-claude', filePath),
    create: (agent: { name: string; systemPrompt: string; model: string; mcps: string[]; provider?: string; shortcut?: string }) =>
      ipcRenderer.invoke('agents:create', agent),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('agents:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('agents:delete', id),
  },

  env: {
    scanAll: () => ipcRenderer.invoke('env:scan-all'),
    projectVars: (projectPath: string) => ipcRenderer.invoke('env:project-vars', projectPath),
    updateVar: (filePath: string, key: string, value: string) => ipcRenderer.invoke('env:update-var', filePath, key, value),
    addVar: (key: string, value: string, projectPaths: string[]) => ipcRenderer.invoke('env:add-var', key, value, projectPaths),
    deleteVar: (filePath: string, key: string) => ipcRenderer.invoke('env:delete-var', filePath, key),
    diff: (pathA: string, pathB: string) => ipcRenderer.invoke('env:diff', pathA, pathB),
    copyValue: (value: string) => ipcRenderer.invoke('env:copy-value', value),
    propagate: (key: string, value: string, projectPaths: string[]) => ipcRenderer.invoke('env:propagate', key, value, projectPaths),
    pullVercel: (projectPath: string, environment?: string) => ipcRenderer.invoke('env:pull-vercel', projectPath, environment),
    projects: () => ipcRenderer.invoke('env:projects'),
    vercelVars: (projectId: string) => ipcRenderer.invoke('env:vercel-vars', projectId),
    vercelCreateVar: (projectId: string, key: string, value: string, target: string[], type?: string) => ipcRenderer.invoke('env:vercel-create-var', projectId, key, value, target, type),
    vercelUpdateVar: (projectId: string, envVarId: string, value: string, target?: string[]) => ipcRenderer.invoke('env:vercel-update-var', projectId, envVarId, value, target),
    vercelDeleteVar: (projectId: string, envVarId: string) => ipcRenderer.invoke('env:vercel-delete-var', projectId, envVarId),
  },

  process: {
    list: () => ipcRenderer.invoke('process:list'),
    orphans: () => ipcRenderer.invoke('process:orphans'),
    kill: (pid: number) => ipcRenderer.invoke('process:kill', pid),
  },

  fs: {
    readDir: (dirPath: string, depth?: number) => ipcRenderer.invoke('fs:readDir', dirPath, depth),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    readImageBase64: (filePath: string) => ipcRenderer.invoke('fs:readImageBase64', filePath),
    writeImageFromBase64: (filePath: string, base64: string) => ipcRenderer.invoke('fs:writeImageFromBase64', filePath, base64),
    pickImage: () => ipcRenderer.invoke('fs:pickImage'),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    createFile: (filePath: string) => ipcRenderer.invoke('fs:createFile', filePath),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    reveal: (targetPath: string) => ipcRenderer.invoke('fs:reveal', targetPath),
    copyPath: (targetPath: string) => ipcRenderer.invoke('fs:copyPath', targetPath),
    iconTheme: () => ipcRenderer.invoke('fs:iconTheme'),
  },

  lsp: {
    status: (projectPath?: string) => ipcRenderer.invoke('lsp:status', projectPath),
    openDocument: (input: { projectPath: string; filePath: string; languageId: string; text: string; version?: number }) =>
      ipcRenderer.invoke('lsp:open-document', input),
    changeDocument: (input: { projectPath: string; filePath: string; languageId: string; text: string; version?: number }) =>
      ipcRenderer.invoke('lsp:change-document', input),
    closeDocument: (input: { projectPath: string; filePath: string; languageId: string }) =>
      ipcRenderer.invoke('lsp:close-document', input),
    hover: (projectPath: string, filePath: string, languageId: string, position: { line: number; character: number }) =>
      ipcRenderer.invoke('lsp:hover', projectPath, filePath, languageId, position),
    definition: (projectPath: string, filePath: string, languageId: string, position: { line: number; character: number }) =>
      ipcRenderer.invoke('lsp:definition', projectPath, filePath, languageId, position),
    completion: (projectPath: string, filePath: string, languageId: string, position: { line: number; character: number }) =>
      ipcRenderer.invoke('lsp:completion', projectPath, filePath, languageId, position),
    diagnostics: (filePath: string) => ipcRenderer.invoke('lsp:diagnostics', filePath),
    shutdownProject: (projectPath: string) => ipcRenderer.invoke('lsp:shutdown-project', projectPath),
    onDiagnostics: (callback: (payload: { uri: string; filePath: string; diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity?: number; code?: string | number; source?: string; message: string }> }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { uri: string; filePath: string; diagnostics: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; severity?: number; code?: string | number; source?: string; message: string }> }) => callback(payload)
      ipcRenderer.on('lsp:diagnostics', handler)
      return () => ipcRenderer.off('lsp:diagnostics', handler)
    },
  },

  claude: {
    projectMcpAll: (projectPath: string) => ipcRenderer.invoke('claude:project-mcp-all', projectPath),
    projectMcpToggle: (projectPath: string, name: string, enabled: boolean) => ipcRenderer.invoke('claude:project-mcp-toggle', projectPath, name, enabled),
    globalMcpAll: () => ipcRenderer.invoke('claude:global-mcp-all'),
    globalMcpToggle: (name: string, enabled: boolean) => ipcRenderer.invoke('claude:global-mcp-toggle', name, enabled),
    mcpAdd: (mcp: { name: string; config: string; description: string; isGlobal: boolean }) => ipcRenderer.invoke('claude:mcp-add', mcp),
    skills: () => ipcRenderer.invoke('claude:skills'),
    restartSession: (terminalId: string) => ipcRenderer.invoke('claude:restart-session', terminalId),
    restartAllSessions: () => ipcRenderer.invoke('claude:restart-all-sessions'),
    status: () => ipcRenderer.invoke('claude:status'),
    usage: (projectPath?: string) => ipcRenderer.invoke('claude:usage', projectPath),
    storeKey: (name: string, value: string) => ipcRenderer.invoke('claude:store-key', name, value),
    listKeys: () => ipcRenderer.invoke('claude:list-keys'),
    deleteKey: (name: string) => ipcRenderer.invoke('claude:delete-key', name),
    claudeMdRead: (projectPath: string) => ipcRenderer.invoke('claude:claudemd-read', projectPath),
    claudeMdGenerate: (projectPath: string) => ipcRenderer.invoke('claude:claudemd-generate', projectPath),
    claudeMdWrite: (projectPath: string, content: string) => ipcRenderer.invoke('claude:claudemd-write', projectPath, content),
    verifyConnection: () => ipcRenderer.invoke('claude:verify-connection'),
    getConnection: () => ipcRenderer.invoke('claude:get-connection'),
    installCli: () => ipcRenderer.invoke('claude:install-cli'),
    authLogin: () => ipcRenderer.invoke('claude:auth-login'),
    disconnect: () => ipcRenderer.invoke('claude:disconnect'),
    suggestCommitMessage: (diff: string) => ipcRenderer.invoke('claude:suggest-commit-message', diff),
    tidyMarkdown: (filePath: string, content: string) => ipcRenderer.invoke('claude:tidy-markdown', filePath, content),
  },

  codex: {
    verifyConnection: () => ipcRenderer.invoke('codex:verify-connection'),
    getConnection: () => ipcRenderer.invoke('codex:get-connection'),
    mcpAll: () => ipcRenderer.invoke('codex:mcp-all'),
    mcpToggle: (name: string, enabled: boolean) => ipcRenderer.invoke('codex:mcp-toggle', name, enabled),
    mcpAdd: (name: string, command: string, args?: string[], env?: Record<string, string>) => ipcRenderer.invoke('codex:mcp-add', name, command, args, env),
    restartSession: (terminalId: string) => ipcRenderer.invoke('codex:restart-session', terminalId),
    restartAllSessions: () => ipcRenderer.invoke('codex:restart-all-sessions'),
    storeKey: (name: string, value: string) => ipcRenderer.invoke('codex:store-key', name, value),
    agentsMdRead: (projectPath: string) => ipcRenderer.invoke('codex:agentsmd-read', projectPath),
    agentsMdWrite: (projectPath: string, content: string) => ipcRenderer.invoke('codex:agentsmd-write', projectPath, content),
    installCli: () => ipcRenderer.invoke('codex:install-cli'),
    logout: () => ipcRenderer.invoke('codex:logout'),
    getModel: () => ipcRenderer.invoke('codex:get-model'),
    getReasoningEffort: () => ipcRenderer.invoke('codex:get-reasoning-effort'),
  },

  provider: {
    verifyAll: () => ipcRenderer.invoke('provider:verify-all'),
    getAllConnections: () => ipcRenderer.invoke('provider:get-all-connections'),
    getDefault: () => ipcRenderer.invoke('provider:get-default'),
    setDefault: (id: string) => ipcRenderer.invoke('provider:set-default', id),
  },

  activity: {
    append: (entry: {
      id: string
      kind: string
      message: string
      context: string | null
      createdAt: number
      sessionId?: string | null
      sessionStatus?: string | null
      projectId?: string | null
      projectName?: string | null
    }) =>
      ipcRenderer.invoke('activity:append', entry),
    list: (limit?: number) => ipcRenderer.invoke('activity:list', limit),
    saveSummary: (targetId: string, summary: string) => ipcRenderer.invoke('activity:save-summary', { targetId, summary }),
    clear: () => ipcRenderer.invoke('activity:clear'),
  },

  events: {
    on: (channel: string, callback: (payload: unknown) => void) => {
      // Whitelist of event channels the renderer is allowed to subscribe to.
      // Add new channels here as new broadcast events are introduced.
      const allowed = new Set([
        'auth:changed',
        'process:changed',
        'port:changed',
        'wallet:changed',
      ])
      if (!allowed.has(channel)) {
        console.warn(`[preload] events.on rejected unknown channel: ${channel}`)
        return () => { /* no-op */ }
      }
      const handler = (_: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.off(channel, handler)
    },
  },

  telemetry: {
    track: (eventName: string, properties?: Record<string, unknown>) =>
      ipcRenderer.invoke('telemetry:track', eventName, properties),
    timing: (eventName: string, durationMs: number, properties?: Record<string, unknown>) =>
      ipcRenderer.invoke('telemetry:timing', eventName, durationMs, properties),
    session: () => ipcRenderer.invoke('telemetry:session'),
    stats: () => ipcRenderer.invoke('telemetry:stats'),
    recent: (limit?: number) => ipcRenderer.invoke('telemetry:recent', limit),
  },

  git: {
    branch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
    branches: (cwd: string) => ipcRenderer.invoke('git:branches', cwd),
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    stage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:stage', cwd, files),
    unstage: (cwd: string, files: string[]) => ipcRenderer.invoke('git:unstage', cwd, files),
    commit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
    push: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
    log: (cwd: string, count?: number) => ipcRenderer.invoke('git:log', cwd, count),
    diff: (cwd: string, filePath?: string) => ipcRenderer.invoke('git:diff', cwd, filePath),
    diffStaged: (cwd: string) => ipcRenderer.invoke('git:diff-staged', cwd),
    checkout: (cwd: string, branch: string) => ipcRenderer.invoke('git:checkout', cwd, branch),
    createBranch: (cwd: string, branchName: string) => ipcRenderer.invoke('git:create-branch', cwd, branchName),
    fetch: (cwd: string) => ipcRenderer.invoke('git:fetch', cwd),
    pull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
    createTag: (cwd: string, tagName: string) => ipcRenderer.invoke('git:create-tag', cwd, tagName),
    stashSave: (cwd: string, message?: string) => ipcRenderer.invoke('git:stash-save', cwd, message),
    stashPop: (cwd: string) => ipcRenderer.invoke('git:stash-pop', cwd),
    stashList: (cwd: string) => ipcRenderer.invoke('git:stash-list', cwd),
    discard: (cwd: string, filePath: string) => ipcRenderer.invoke('git:discard', cwd, filePath),
  },

  ports: {
    scan: () => ipcRenderer.invoke('ports:scan'),
    registered: () => ipcRenderer.invoke('ports:registered'),
    register: (port: number, projectId: string, serviceName: string) => ipcRenderer.invoke('ports:register', port, projectId, serviceName),
    unregister: (port: number, projectId: string) => ipcRenderer.invoke('ports:unregister', port, projectId),
    ghosts: () => ipcRenderer.invoke('ports:ghosts'),
    kill: (port: number) => ipcRenderer.invoke('ports:kill', port),
  },

  wallet: {
    dashboard: (projectId?: string | null) => ipcRenderer.invoke('wallet:dashboard', projectId ?? null),
    list: () => ipcRenderer.invoke('wallet:list'),
    create: (wallet: { name: string; address: string }) => ipcRenderer.invoke('wallet:create', wallet),
    delete: (id: string) => ipcRenderer.invoke('wallet:delete', id),
    rename: (id: string, name: string) => ipcRenderer.invoke('wallet:rename', id, name),
    setDefault: (id: string) => ipcRenderer.invoke('wallet:set-default', id),
    assignProject: (projectId: string, walletId: string | null) => ipcRenderer.invoke('wallet:assign-project', projectId, walletId),
    storeHeliusKey: (value: string) => ipcRenderer.invoke('wallet:store-helius-key', value),
    deleteHeliusKey: () => ipcRenderer.invoke('wallet:delete-helius-key'),
    hasHeliusKey: () => ipcRenderer.invoke('wallet:has-helius-key'),
    storeJupiterKey: (value: string) => ipcRenderer.invoke('wallet:store-jupiter-key', value),
    deleteJupiterKey: () => ipcRenderer.invoke('wallet:delete-jupiter-key'),
    hasJupiterKey: () => ipcRenderer.invoke('wallet:has-jupiter-key'),
    generate: (input: { name: string; walletType?: string; agentId?: string }) => ipcRenderer.invoke('wallet:generate', input),
    sendSol: (input: { fromWalletId: string; toAddress: string; amountSol?: number; sendMax?: boolean }) => ipcRenderer.invoke('wallet:send-sol', input),
    sendToken: (input: { fromWalletId: string; toAddress: string; mint: string; amount?: number; sendMax?: boolean }) => ipcRenderer.invoke('wallet:send-token', input),
    balance: (walletId: string) => ipcRenderer.invoke('wallet:balance', walletId),
    holdings: (walletId: string) => ipcRenderer.invoke('wallet:holdings', walletId),
    swapQuote: (input: { walletId: string; inputMint: string; outputMint: string; amount: number; slippageBps: number }) => ipcRenderer.invoke('wallet:swap-quote', input),
    transactionPreview: (input: object) => ipcRenderer.invoke('wallet:transaction-preview', input),
    swapExecute: (input: { walletId: string; inputMint: string; outputMint: string; amount: number; slippageBps: number; rawQuoteResponse?: unknown; confirmedAt: number; acknowledgedImpact: boolean }) => ipcRenderer.invoke('wallet:swap-execute', input),
    agentWallets: (agentId?: string) => ipcRenderer.invoke('wallet:agent-wallets', agentId),
    createAgentWallet: (agentId: string, agentName: string) => ipcRenderer.invoke('wallet:create-agent-wallet', agentId, agentName),
    hasKeypair: (walletId: string) => ipcRenderer.invoke('wallet:has-keypair', walletId),
    transactionHistory: (walletId: string, limit?: number) => ipcRenderer.invoke('wallet:transaction-history', walletId, limit),
    exportPrivateKey: (walletId: string) => ipcRenderer.invoke('wallet:export-private-key', walletId),
  },

  pro: {
    status: () => ipcRenderer.invoke('pro:status'),
    refreshStatus: (walletAddress: string) => ipcRenderer.invoke('pro:refresh-status', walletAddress),
    fetchPrice: () => ipcRenderer.invoke('pro:fetch-price'),
    subscribe: (walletId: string) => ipcRenderer.invoke('pro:subscribe', walletId),
    claimHolderAccess: (walletId: string) => ipcRenderer.invoke('pro:claim-holder-access', walletId),
    signOut: () => ipcRenderer.invoke('pro:sign-out'),
    arenaList: () => ipcRenderer.invoke('pro:arena-list'),
    arenaSubmit: (input: unknown) => ipcRenderer.invoke('pro:arena-submit', input),
    arenaVote: (submissionId: string) => ipcRenderer.invoke('pro:arena-vote', submissionId),
    skillsManifest: () => ipcRenderer.invoke('pro:skills-manifest'),
    skillsSync: () => ipcRenderer.invoke('pro:skills-sync'),
    skillsDownload: (skillId: string) => ipcRenderer.invoke('pro:skills-download', skillId),
    quota: () => ipcRenderer.invoke('pro:quota'),
    mcpPush: () => ipcRenderer.invoke('pro:mcp-push'),
    mcpPull: () => ipcRenderer.invoke('pro:mcp-pull'),
  },

  pnl: {
    syncHistory: (walletAddress?: string) => ipcRenderer.invoke('pnl:sync-history', walletAddress),
    getPortfolio: (walletAddress: string, holdings: Array<{ mint: string; symbol: string; name: string; amount: number; logoUri: string | null }>) => ipcRenderer.invoke('pnl:get-portfolio', walletAddress, holdings),
    getTokenDetail: (walletAddress: string, mint: string) => ipcRenderer.invoke('pnl:get-token-detail', walletAddress, mint),
    refreshPrices: (mints: string[]) => ipcRenderer.invoke('pnl:refresh-prices', mints),
  },

  settings: {
    getUi: () => ipcRenderer.invoke('settings:get-ui'),
    getAppMeta: () => ipcRenderer.invoke('settings:get-app-meta'),
    setShowMarketTape: (enabled: boolean) => ipcRenderer.invoke('settings:set-show-market-tape', enabled),
    setShowTitlebarWallet: (enabled: boolean) => ipcRenderer.invoke('settings:set-show-titlebar-wallet', enabled),
    isOnboardingComplete: () => ipcRenderer.invoke('settings:is-onboarding-complete'),
    setOnboardingComplete: (complete: boolean) => ipcRenderer.invoke('settings:set-onboarding-complete', complete),
    getOnboardingProgress: () => ipcRenderer.invoke('settings:get-onboarding-progress'),
    setOnboardingProgress: (progress: object) => ipcRenderer.invoke('settings:set-onboarding-progress', progress),
    reportCrash: (data: { type: string; message: string; stack: string }) => ipcRenderer.invoke('settings:report-crash', data),
    getCrashes: () => ipcRenderer.invoke('settings:get-crashes'),
    clearCrashes: () => ipcRenderer.invoke('settings:clear-crashes'),
    recoverUiState: () => ipcRenderer.invoke('settings:recover-ui-state'),
    getPinnedTools: () => ipcRenderer.invoke('settings:get-pinned-tools'),
    setPinnedTools: (tools: string[]) => ipcRenderer.invoke('settings:set-pinned-tools', tools),
    getDrawerToolOrder: () => ipcRenderer.invoke('settings:get-drawer-tool-order'),
    setDrawerToolOrder: (order: string[]) => ipcRenderer.invoke('settings:set-drawer-tool-order', order),
    getWorkspaceProfile: () => ipcRenderer.invoke('settings:get-workspace-profile'),
    setWorkspaceProfile: (profile: object) => ipcRenderer.invoke('settings:set-workspace-profile', profile),
    getTokenLaunchSettings: () => ipcRenderer.invoke('settings:get-token-launch-settings'),
    setTokenLaunchSettings: (settings: object) => ipcRenderer.invoke('settings:set-token-launch-settings', settings),
    getWalletInfrastructureSettings: () => ipcRenderer.invoke('settings:get-wallet-infrastructure-settings'),
    getSolanaRuntimeStatus: () => ipcRenderer.invoke('settings:get-solana-runtime-status'),
    setWalletInfrastructureSettings: (settings: object) => ipcRenderer.invoke('settings:set-wallet-infrastructure-settings', settings),
    getLayout: () => ipcRenderer.invoke('settings:get-layout'),
    setLayout: (layout: { centerMode?: string; rightPanelTab?: string }) => ipcRenderer.invoke('settings:set-layout', layout),
    onCrashWarning: (callback: (count: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, count: number) => callback(count)
      ipcRenderer.on('crash-warning', handler)
      return () => ipcRenderer.off('crash-warning', handler)
    },
    onUiRecoveryApplied: (callback: (result: { clearedKeys: string[]; clearedActiveSessions: number; ranAt: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, result: { clearedKeys: string[]; clearedActiveSessions: number; ranAt: number }) => callback(result)
      ipcRenderer.on('ui-recovery-applied', handler)
      return () => ipcRenderer.off('ui-recovery-applied', handler)
    },
  },

  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    add: (input: { id: string; name: string; description?: string; entry?: string; command?: string }) => ipcRenderer.invoke('plugins:add', input),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('plugins:set-enabled', id, enabled),
    setConfig: (id: string, config: string) => ipcRenderer.invoke('plugins:set-config', id, config),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('plugins:reorder', orderedIds),
  },

  browser: {
    navigate: (url: string) => ipcRenderer.invoke('browser:navigate', url),
    capture: (pageId: string, url: string, title: string, content: string) => ipcRenderer.invoke('browser:capture', pageId, url, title, content),
    content: (pageId: string) => ipcRenderer.invoke('browser:content', pageId),
    analyze: (pageId: string, type: string, target?: string) => ipcRenderer.invoke('browser:analyze', pageId, type, target),
    audit: (pageId: string) => ipcRenderer.invoke('browser:audit', pageId),
    history: () => ipcRenderer.invoke('browser:history'),
    clear: () => ipcRenderer.invoke('browser:clear'),
    chat: (sessionId: string, message: string, browserContext?: string) => ipcRenderer.invoke('browser:chat', sessionId, message, browserContext),
    chatReset: (sessionId: string) => ipcRenderer.invoke('browser:chat-reset', sessionId),
  },

  feedback: {
    submit: (input: { title: string; description: string; activePanel?: string; logs?: string }) =>
      ipcRenderer.invoke('feedback:submit', input),
    openUrl: (url: string) => ipcRenderer.invoke('feedback:open-url', url),
  },

  tweets: {
    generate: (prompt: string, mode: string, sourceTweet?: string) => ipcRenderer.invoke('tweets:generate', prompt, mode, sourceTweet),
    list: (limit?: number) => ipcRenderer.invoke('tweets:list', limit),
    update: (id: string, updates: object) => ipcRenderer.invoke('tweets:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('tweets:delete', id),
    voiceGet: () => ipcRenderer.invoke('tweets:voice-get'),
    voiceUpdate: (systemPrompt: string, examples: string[]) => ipcRenderer.invoke('tweets:voice-update', systemPrompt, examples),
  },

  recovery: {
    importCsv: () => ipcRenderer.invoke('recovery:import-csv'),
    scan: () => ipcRenderer.invoke('recovery:scan'),
    execute: (masterAddress: string) => ipcRenderer.invoke('recovery:execute', masterAddress),
    status: () => ipcRenderer.invoke('recovery:status'),
    stop: () => ipcRenderer.invoke('recovery:stop'),
    onProgress: (callback: (event: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as never)
      ipcRenderer.on('recovery:progress', handler)
      return () => ipcRenderer.off('recovery:progress', handler)
    },
  },

  engine: {
    run: (action: { type: string; projectId?: string; payload?: Record<string, unknown> }) =>
      ipcRenderer.invoke('engine:run', action),
    context: () => ipcRenderer.invoke('engine:context'),
    fixClaudeMd: (projectId: string) => ipcRenderer.invoke('engine:fix-claude-md', projectId),
    generateClaudeMd: (projectId: string) => ipcRenderer.invoke('engine:generate-claude-md', projectId),
    debugSetup: (projectId: string, question?: string) => ipcRenderer.invoke('engine:debug-setup', projectId, question),
    healthCheck: () => ipcRenderer.invoke('engine:health-check'),
    explainError: (error: string, projectId?: string) => ipcRenderer.invoke('engine:explain-error', error, projectId),
    ask: (question: string, projectId?: string) => ipcRenderer.invoke('engine:ask', question, projectId),
  },

  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (project: { name: string; path: string }) => ipcRenderer.invoke('projects:create', project),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    openDialog: () => ipcRenderer.invoke('projects:openDialog'),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  },

  pumpfun: {
    bondingCurve: (mint: string) => ipcRenderer.invoke('pumpfun:bonding-curve', mint),
    createToken: (input: object) => ipcRenderer.invoke('pumpfun:create-token', input),
    buy: (input: object) => ipcRenderer.invoke('pumpfun:buy', input),
    sell: (input: object) => ipcRenderer.invoke('pumpfun:sell', input),
    collectFees: (walletId: string) => ipcRenderer.invoke('pumpfun:collect-fees', walletId),
    pickImage: () => ipcRenderer.invoke('pumpfun:pick-image'),
    hasKeypair: (walletId: string) => ipcRenderer.invoke('pumpfun:has-keypair', walletId),
    importKeypair: (walletId: string) => ipcRenderer.invoke('pumpfun:import-keypair', walletId),
  },

  launch: {
    listLaunchpads: () => ipcRenderer.invoke('launch:list-launchpads'),
    listWalletOptions: (projectId?: string | null) => ipcRenderer.invoke('launch:list-wallet-options', projectId),
    ensureDaemonDeployerWallet: (projectId?: string | null) => ipcRenderer.invoke('launch:ensure-daemon-deployer-wallet', projectId),
    listPulseTokens: (input?: { category?: PulseTokenCategory; pageNumber?: number; pageSize?: number }) => ipcRenderer.invoke('launch:list-pulse-tokens', input),
    pickImage: () => ipcRenderer.invoke('launch:pick-image'),
    preflightToken: (input: object) => ipcRenderer.invoke('launch:preflight-token', input),
    createToken: (input: object) => ipcRenderer.invoke('launch:create-token', input),
    saveToken: (input: object) => ipcRenderer.invoke('launch:save-token', input),
    listTokens: (walletId?: string) => ipcRenderer.invoke('launch:list-tokens', walletId),
    getToken: (idOrMint: string) => ipcRenderer.invoke('launch:get-token', idOrMint),
  },

  aria: {
    send: (sessionId: string, message: string) => ipcRenderer.invoke('aria:send', sessionId, message),
    history: (sessionId: string, limit?: number) => ipcRenderer.invoke('aria:history', sessionId, limit),
    clear: (sessionId: string) => ipcRenderer.invoke('aria:clear', sessionId),
  },

  dashboard: {
    tokenPrice: (mint: string) => ipcRenderer.invoke('dashboard:token-price', mint),
    tokenMetadata: (mint: string) => ipcRenderer.invoke('dashboard:token-metadata', mint),
    tokenHolders: (mint: string) => ipcRenderer.invoke('dashboard:token-holders', mint),
    detectTokens: (walletAddress: string) => ipcRenderer.invoke('dashboard:detect-tokens', walletAddress),
    importToken: (mint: string, walletId: string) => ipcRenderer.invoke('dashboard:import-token', mint, walletId),
  },

  images: {
    generate: (input: { prompt: string; model: string; aspectRatio: string; projectId?: string; tags?: string[] }) => ipcRenderer.invoke('images:generate', input),
    list: (filter?: { projectId?: string; source?: string; model?: string; limit?: number; offset?: number }) => ipcRenderer.invoke('images:list', filter ?? {}),
    get: (id: string) => ipcRenderer.invoke('images:get', id),
    delete: (id: string) => ipcRenderer.invoke('images:delete', id),
    updateTags: (id: string, tags: string[]) => ipcRenderer.invoke('images:update-tags', id, tags),
    getBase64: (id: string) => ipcRenderer.invoke('images:get-base64', id),
    importFile: () => ipcRenderer.invoke('images:import-file'),
    reveal: (id: string) => ipcRenderer.invoke('images:reveal', id),
    startWatcher: () => ipcRenderer.invoke('images:watcher-start'),
    stopWatcher: () => ipcRenderer.invoke('images:watcher-stop'),
    watcherStatus: () => ipcRenderer.invoke('images:watcher-status'),
    hasApiKey: () => ipcRenderer.invoke('images:has-api-key'),
    onWatcherNew: (callback: (payload: { id: string; filename: string; source: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; filename: string; source: string }) => callback(payload)
      ipcRenderer.on('images:watcher-new', handler)
      return () => ipcRenderer.off('images:watcher-new', handler)
    },
  },

  email: {
    accounts: () => ipcRenderer.invoke('email:accounts'),
    hasGmailCreds: () => ipcRenderer.invoke('email:has-gmail-creds'),
    storeGmailCreds: (clientId: string, clientSecret: string) => ipcRenderer.invoke('email:store-gmail-creds', clientId, clientSecret),
    addGmail: (clientId?: string, clientSecret?: string) => ipcRenderer.invoke('email:add-gmail', clientId, clientSecret),
    addICloud: (email: string, appPassword: string) => ipcRenderer.invoke('email:add-icloud', email, appPassword),
    remove: (accountId: string) => ipcRenderer.invoke('email:remove', accountId),
    messages: (accountId: string, query?: string, max?: number) => ipcRenderer.invoke('email:messages', accountId, query, max),
    read: (accountId: string, messageId: string) => ipcRenderer.invoke('email:read', accountId, messageId),
    send: (accountId: string, to: string, subject: string, body: string, cc?: string, bcc?: string) => ipcRenderer.invoke('email:send', accountId, to, subject, body, cc, bcc),
    markRead: (accountId: string, messageIds: string[]) => ipcRenderer.invoke('email:mark-read', accountId, messageIds),
    markAllRead: (accountId?: string) => ipcRenderer.invoke('email:mark-all-read', accountId),
    extract: (accountId: string, messageId: string) => ipcRenderer.invoke('email:extract', accountId, messageId),
    summarize: (accountId: string, messageId: string) => ipcRenderer.invoke('email:summarize', accountId, messageId),
    sync: (accountId: string) => ipcRenderer.invoke('email:sync', accountId),
    unreadCounts: () => ipcRenderer.invoke('email:unread-counts'),
    settings: (accountId: string, settings: string) => ipcRenderer.invoke('email:settings', accountId, settings),
  },

  deploy: {
    authStatus: () => ipcRenderer.invoke('deploy:auth-status'),
    connectVercel: (token: string) => ipcRenderer.invoke('deploy:connect-vercel', token),
    connectRailway: (token: string) => ipcRenderer.invoke('deploy:connect-railway', token),
    disconnect: (platform: string) => ipcRenderer.invoke('deploy:disconnect', platform),
    vercelProjects: (teamId?: string) => ipcRenderer.invoke('deploy:vercel-projects', teamId),
    railwayProjects: () => ipcRenderer.invoke('deploy:railway-projects'),
    link: (projectId: string, platform: string, linkData: object) => ipcRenderer.invoke('deploy:link', projectId, platform, linkData),
    unlink: (projectId: string, platform: string) => ipcRenderer.invoke('deploy:unlink', projectId, platform),
    status: (projectId: string) => ipcRenderer.invoke('deploy:status', projectId),
    deployments: (projectId: string, platform: string, limit?: number) => ipcRenderer.invoke('deploy:deployments', projectId, platform, limit),
    redeploy: (projectId: string, platform: string) => ipcRenderer.invoke('deploy:redeploy', projectId, platform),
    envVars: (projectId: string, platform: string) => ipcRenderer.invoke('deploy:env-vars', projectId, platform),
    autoDetect: (projectPath: string) => ipcRenderer.invoke('deploy:auto-detect', projectPath),
  },

  registry: {
    listSessions: (limit?: number) => ipcRenderer.invoke('registry:list-sessions', limit),
    getProfile: () => ipcRenderer.invoke('registry:get-profile'),
    listAgentWork: (limit?: number) => ipcRenderer.invoke('registry:list-agent-work', limit),
    createAgentWork: (input: object) => ipcRenderer.invoke('registry:create-agent-work', input),
    fundAgentWork: (taskId: string) => ipcRenderer.invoke('registry:fund-agent-work', taskId),
    startAgentWork: (taskId: string, sessionId?: string | null) => ipcRenderer.invoke('registry:start-agent-work', taskId, sessionId ?? null),
    submitAgentWork: (taskId: string, input?: object) => ipcRenderer.invoke('registry:submit-agent-work', taskId, input ?? {}),
    approveAgentWork: (taskId: string) => ipcRenderer.invoke('registry:approve-agent-work', taskId),
    rejectAgentWork: (taskId: string) => ipcRenderer.invoke('registry:reject-agent-work', taskId),
    settleAgentWork: (taskId: string, signature?: string | null) => ipcRenderer.invoke('registry:settle-agent-work', taskId, signature ?? null),
    publishSession: (sessionId: string) => ipcRenderer.invoke('registry:publish-session', sessionId),
    publishAll: () => ipcRenderer.invoke('registry:publish-all'),
    renameSession: (sessionId: string, name: string) => ipcRenderer.invoke('registry:rename-session', sessionId, name),
  },

  colosseum: {
    status: () => ipcRenderer.invoke('colosseum:status'),
    searchProjects: (query: string, limit?: number, filters?: object) => ipcRenderer.invoke('colosseum:search-projects', query, limit, filters),
    searchArchives: (query: string, limit?: number) => ipcRenderer.invoke('colosseum:search-archives', query, limit),
    projectDetail: (slug: string) => ipcRenderer.invoke('colosseum:project-detail', slug),
    filters: () => ipcRenderer.invoke('colosseum:filters'),
    storePat: (pat: string) => ipcRenderer.invoke('colosseum:store-pat', pat),
    isConfigured: () => ipcRenderer.invoke('colosseum:is-configured'),
  },

  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
    get: (id: string) => ipcRenderer.invoke('tools:get', id),
    create: (opts: { name: string; description?: string; category: string; language: string }) => ipcRenderer.invoke('tools:create', opts),
    delete: (id: string, deleteFiles: boolean) => ipcRenderer.invoke('tools:delete', id, deleteFiles),
    runCommand: (id: string) => ipcRenderer.invoke('tools:runCommand', id),
    markRunning: (id: string, terminalId: string, pid: number) => ipcRenderer.invoke('tools:markRunning', id, terminalId, pid),
    markStopped: (toolId: string) => ipcRenderer.invoke('tools:markStopped', toolId),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('tools:update', id, data),
    discover: () => ipcRenderer.invoke('tools:discover'),
    status: (id: string) => ipcRenderer.invoke('tools:status', id),
    basePath: () => ipcRenderer.invoke('tools:basePath'),
    openFolder: (id: string) => ipcRenderer.invoke('tools:openFolder', id),
    import: () => ipcRenderer.invoke('tools:import'),
  },

  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    get: (id: string) => ipcRenderer.invoke('vault:get', id),
    store: (opts: { name: string; data: string; fileType: string; ownerWallet?: string }) => ipcRenderer.invoke('vault:store', opts),
    retrieve: (id: string) => ipcRenderer.invoke('vault:retrieve', id),
    delete: (id: string) => ipcRenderer.invoke('vault:delete', id),
    setOwner: (id: string, ownerWallet: string | null) => ipcRenderer.invoke('vault:set-owner', id, ownerWallet),
    importFile: () => ipcRenderer.invoke('vault:import-file'),
  },

  validator: {
    start: (type: string) => ipcRenderer.invoke('validator:start', type),
    stop: () => ipcRenderer.invoke('validator:stop'),
    status: () => ipcRenderer.invoke('validator:status'),
    detect: () => ipcRenderer.invoke('validator:detect'),
    toolchainStatus: (projectPath?: string) => ipcRenderer.invoke('validator:toolchain-status', projectPath),
    detectProject: (projectPath: string) => ipcRenderer.invoke('validator:detect-project', projectPath),
    onStatusChange: (callback: (state: unknown) => void) => {
      const handler = (_event: unknown, state: unknown) => callback(state)
      ipcRenderer.on('validator:status-change', handler)
      return () => { ipcRenderer.off('validator:status-change', handler) }
    },
  },

  agentStation: {
    list: () => ipcRenderer.invoke('agent-station:list'),
    get: (id: string) => ipcRenderer.invoke('agent-station:get', id),
    create: (input: { name: string; description?: string; template: string; wallet_id?: string | null; plugins?: string[]; rpc_url?: string | null; model?: string }) =>
      ipcRenderer.invoke('agent-station:create', input),
    delete: (id: string) => ipcRenderer.invoke('agent-station:delete', id),
    scaffold: (configId: string, outputDir: string) => ipcRenderer.invoke('agent-station:scaffold', configId, outputDir),
    pickOutputDir: () => ipcRenderer.invoke('agent-station:pick-output-dir'),
    storeKey: (configId: string, privateKey: string) => ipcRenderer.invoke('agent-station:store-key', configId, privateKey),
    hasKey: (configId: string) => ipcRenderer.invoke('agent-station:has-key', configId),
    deleteKey: (configId: string) => ipcRenderer.invoke('agent-station:delete-key', configId),
    updateStatus: (id: string, status: 'idle' | 'running' | 'stopped') => ipcRenderer.invoke('agent-station:update-status', id, status),
  },

  replay: {
    fetchTrace: (signature: string, force?: boolean) => ipcRenderer.invoke('replay:fetch-trace', signature, force === true),
    fetchProgram: (programId: string, limit?: number) => ipcRenderer.invoke('replay:fetch-program', programId, limit),
    buildContext: (signature: string) => ipcRenderer.invoke('replay:build-context', signature),
    createHandoff: (projectPath: string, signature: string) => ipcRenderer.invoke('replay:create-handoff', projectPath, signature),
    verifyFix: (projectPath: string, signature: string, command: string) => ipcRenderer.invoke('replay:verify-fix', projectPath, signature, command),
    rpcLabel: () => ipcRenderer.invoke('replay:rpc-label'),
  },
})

// Loading screen
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) resolve(true)
      })
    }
  })
}

function useLoading() {
  const styleContent = `
.daemon-loading {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
  z-index: 9;
  gap: 28px;
  transition: opacity 0.4s ease, visibility 0.4s ease;
}
.daemon-loading--hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.daemon-loading__ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  box-shadow:
    inset 0 0 0 1.5px rgba(62,207,142,0.12),
    inset 0 0 12px rgba(62,207,142,0.08),
    0 0 16px rgba(62,207,142,0.06);
  animation: dl-spin 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite;
  position: relative;
}
.daemon-loading__ring::before {
  content: '';
  position: absolute;
  inset: -1.5px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  border-top-color: #3ecf8e;
  border-right-color: rgba(62,207,142,0.4);
  box-shadow: 0 0 8px rgba(62,207,142,0.35), 0 0 20px rgba(62,207,142,0.12);
}
.daemon-loading__text {
  display: flex;
  gap: 2px;
}
.daemon-loading__letter {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #f0f0f0;
  display: inline-block;
  animation: dl-pulse 2.8s ease-in-out infinite;
}
.daemon-loading__letter:nth-child(1) { animation-delay: 0.00s; }
.daemon-loading__letter:nth-child(2) { animation-delay: 0.08s; }
.daemon-loading__letter:nth-child(3) { animation-delay: 0.16s; }
.daemon-loading__letter:nth-child(4) { animation-delay: 0.24s; }
.daemon-loading__letter:nth-child(5) { animation-delay: 0.32s; }
.daemon-loading__letter:nth-child(6) { animation-delay: 0.40s; }
.daemon-loading__status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: #505050;
  min-height: 14px;
}
.daemon-loading__bar {
  width: 160px;
  height: 1px;
  background: #222222;
  border-radius: 1px;
  overflow: hidden;
}
.daemon-loading__fill {
  height: 100%;
  background: linear-gradient(90deg, #2a8c62, #3ecf8e);
  box-shadow: 0 0 6px rgba(62,207,142,0.5);
  border-radius: 1px;
  animation: dl-sweep 2s cubic-bezier(0.4,0,0.6,1) infinite;
}
@keyframes dl-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes dl-pulse {
  0%, 60%, 100% { color: #f0f0f0; text-shadow: none; }
  30% { color: #3ecf8e; text-shadow: 0 0 12px rgba(62,207,142,0.5); }
}
@keyframes dl-sweep {
  0%   { width: 0%;  margin-left: 0%; }
  50%  { width: 60%; margin-left: 20%; }
  100% { width: 0%;  margin-left: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .daemon-loading__ring, .daemon-loading__letter, .daemon-loading__fill { animation: none; }
  .daemon-loading__fill { width: 40%; }
}
  `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'daemon-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'daemon-loading'
  oDiv.innerHTML = `
    <div class="daemon-loading__ring"></div>
    <div class="daemon-loading__text">
      <span class="daemon-loading__letter">D</span>
      <span class="daemon-loading__letter">A</span>
      <span class="daemon-loading__letter">E</span>
      <span class="daemon-loading__letter">M</span>
      <span class="daemon-loading__letter">O</span>
      <span class="daemon-loading__letter">N</span>
    </div>
    <div class="daemon-loading__status">initializing...</div>
    <div class="daemon-loading__bar"><div class="daemon-loading__fill"></div></div>
  `

  return {
    appendLoading() {
      document.head.appendChild(oStyle)
      document.body.appendChild(oDiv)
    },
    removeLoading() {
      oDiv.classList.add('daemon-loading--hidden')
      setTimeout(() => { oStyle.remove(); oDiv.remove() }, 450)
    },
  }
}

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
