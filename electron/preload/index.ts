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
    create: (opts?: { cwd?: string; startupCommand?: string; userInitiated?: boolean }) => ipcRenderer.invoke('terminal:create', opts ?? {}),
    spawnAgent: (opts: { agentId: string; projectId: string }) => ipcRenderer.invoke('terminal:spawnAgent', opts),
    write: (id: string, data: string) => ipcRenderer.send('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
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
    create: (agent: { name: string; systemPrompt: string; model: string; mcps: string[]; shortcut?: string }) =>
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
  },

  process: {
    list: () => ipcRenderer.invoke('process:list'),
    orphans: () => ipcRenderer.invoke('process:orphans'),
    kill: (pid: number) => ipcRenderer.invoke('process:kill', pid),
  },

  fs: {
    readDir: (dirPath: string, depth?: number) => ipcRenderer.invoke('fs:readDir', dirPath, depth),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    createFile: (filePath: string) => ipcRenderer.invoke('fs:createFile', filePath),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    reveal: (targetPath: string) => ipcRenderer.invoke('fs:reveal', targetPath),
    copyPath: (targetPath: string) => ipcRenderer.invoke('fs:copyPath', targetPath),
    iconTheme: () => ipcRenderer.invoke('fs:iconTheme'),
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
    suggestCommitMessage: (diff: string) => ipcRenderer.invoke('claude:suggest-commit-message', diff),
    tidyMarkdown: (filePath: string, content: string) => ipcRenderer.invoke('claude:tidy-markdown', filePath, content),
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
    setDefault: (id: string) => ipcRenderer.invoke('wallet:set-default', id),
    assignProject: (projectId: string, walletId: string | null) => ipcRenderer.invoke('wallet:assign-project', projectId, walletId),
    storeHeliusKey: (value: string) => ipcRenderer.invoke('wallet:store-helius-key', value),
    deleteHeliusKey: () => ipcRenderer.invoke('wallet:delete-helius-key'),
    hasHeliusKey: () => ipcRenderer.invoke('wallet:has-helius-key'),
  },

  settings: {
    getUi: () => ipcRenderer.invoke('settings:get-ui'),
    setShowMarketTape: (enabled: boolean) => ipcRenderer.invoke('settings:set-show-market-tape', enabled),
    setShowTitlebarWallet: (enabled: boolean) => ipcRenderer.invoke('settings:set-show-titlebar-wallet', enabled),
  },

  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('plugins:set-enabled', id, enabled),
    setConfig: (id: string, config: string) => ipcRenderer.invoke('plugins:set-config', id, config),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke('plugins:reorder', orderedIds),
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

  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
    get: (id: string) => ipcRenderer.invoke('tools:get', id),
    create: (opts: { name: string; description?: string; category: string; language: string }) => ipcRenderer.invoke('tools:create', opts),
    delete: (id: string, deleteFiles: boolean) => ipcRenderer.invoke('tools:delete', id, deleteFiles),
    runCommand: (id: string) => ipcRenderer.invoke('tools:runCommand', id),
    markRunning: (id: string, terminalId: string, pid: number) => ipcRenderer.invoke('tools:markRunning', id, terminalId, pid),
    markStopped: (toolId: string) => ipcRenderer.invoke('tools:mark-stopped', toolId),
    update: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('tools:update', id, data),
    discover: () => ipcRenderer.invoke('tools:discover'),
    status: (id: string) => ipcRenderer.invoke('tools:status', id),
    basePath: () => ipcRenderer.invoke('tools:base-path'),
    openFolder: (id: string) => ipcRenderer.invoke('tools:openFolder', id),
    import: () => ipcRenderer.invoke('tools:import'),
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
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
  z-index: 9;
  font-family: 'Plus Jakarta Sans', sans-serif;
  color: #7a7a7a;
  font-size: 14px;
  letter-spacing: 0.5px;
}
  `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'daemon-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'daemon-loading'
  oDiv.innerHTML = 'DAEMON'

  return {
    appendLoading() {
      document.head.appendChild(oStyle)
      document.body.appendChild(oDiv)
    },
    removeLoading() {
      oStyle.remove()
      oDiv.remove()
    },
  }
}

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
