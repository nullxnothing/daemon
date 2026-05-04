import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { broadcast } from './EventBus'
import { LogService } from './LogService'
import { isPathSafe, isProjectPathSafe } from '../shared/pathValidation'
import type {
  LspCompletionItem,
  LspCompletionResult,
  LspDiagnostic,
  LspDiagnosticEvent,
  LspDocumentInput,
  LspDocumentSyncResult,
  LspHoverResult,
  LspLocation,
  LspPosition,
  LspServerStatus,
} from '../shared/types'

type JsonRpcId = number | string

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface ServerDefinition {
  id: 'typescript' | 'python' | 'rust'
  label: string
  command: string
  args: string[]
  languageIds: string[]
  extensions: string[]
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface OpenDocument {
  uri: string
  filePath: string
  languageId: string
  version: number
}

interface LspSession {
  key: string
  definition: ServerDefinition
  projectPath: string
  commandPath: string
  process: ChildProcessWithoutNullStreams
  buffer: Buffer
  nextId: number
  pending: Map<JsonRpcId, PendingRequest>
  documents: Map<string, OpenDocument>
  diagnostics: Map<string, LspDiagnostic[]>
  ready: Promise<void>
  startedAt: number
  exited: boolean
  lastError: string | null
}

const SERVER_DEFINITIONS: ServerDefinition[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    id: 'python',
    label: 'Python',
    command: 'pyright-langserver',
    args: ['--stdio'],
    languageIds: ['python'],
    extensions: ['.py', '.pyi'],
  },
  {
    id: 'rust',
    label: 'Rust',
    command: 'rust-analyzer',
    args: [],
    languageIds: ['rust'],
    extensions: ['.rs'],
  },
]

const commandCache = new Map<string, string | null>()
const requestTimeoutMs = 8_000

function normalizePathForKey(value: string): string {
  return path.resolve(value).toLowerCase()
}

function filePathToUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).toString()
}

function uriToFilePath(uri: string): string {
  try {
    return fileURLToPath(uri)
  } catch {
    return uri
  }
}

function getDefinitionForDocument(filePath: string, languageId: string): ServerDefinition | null {
  const ext = path.extname(filePath).toLowerCase()
  return SERVER_DEFINITIONS.find((definition) =>
    definition.languageIds.includes(languageId) || definition.extensions.includes(ext)
  ) ?? null
}

function localBinPath(rootPath: string, command: string): string {
  const suffix = process.platform === 'win32' ? '.cmd' : ''
  return path.join(rootPath, 'node_modules', '.bin', `${command}${suffix}`)
}

function resolveCommand(command: string, projectPath: string): string | null {
  const cacheKey = `${process.platform}:${projectPath}:${command}`
  if (commandCache.has(cacheKey)) return commandCache.get(cacheKey) ?? null

  const candidates = [
    localBinPath(projectPath, command),
    localBinPath(process.env.APP_ROOT ?? process.cwd(), command),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      commandCache.set(cacheKey, candidate)
      return candidate
    }
  }

  try {
    const lookup = process.platform === 'win32'
      ? execFileSync('where.exe', [command], { encoding: 'utf8', windowsHide: true, timeout: 2_000 })
      : execFileSync('which', [command], { encoding: 'utf8', timeout: 2_000 })
    const found = lookup.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] ?? null
    commandCache.set(cacheKey, found)
    return found
  } catch {
    return null
  }
}

function toLspLanguageId(filePath: string, fallback: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.tsx') return 'typescriptreact'
  if (ext === '.jsx') return 'javascriptreact'
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return 'typescript'
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript'
  if (ext === '.py' || ext === '.pyi') return 'python'
  if (ext === '.rs') return 'rust'
  return fallback
}

function getBodySeparator(buffer: Buffer): { index: number; length: number } | null {
  const crlfIndex = buffer.indexOf('\r\n\r\n')
  if (crlfIndex >= 0) return { index: crlfIndex, length: 4 }
  const lfIndex = buffer.indexOf('\n\n')
  if (lfIndex >= 0) return { index: lfIndex, length: 2 }
  return null
}

function textFromMarkup(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(textFromMarkup).filter(Boolean).join('\n\n') || null
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.language === 'string' && typeof record.value === 'string') {
      return `\`\`\`${record.language}\n${record.value}\n\`\`\``
    }
    if (typeof record.value === 'string') return record.value
  }
  return null
}

function normalizeDiagnostic(diagnostic: unknown): LspDiagnostic | null {
  if (!diagnostic || typeof diagnostic !== 'object') return null
  const record = diagnostic as Record<string, unknown>
  const range = record.range as LspDiagnostic['range'] | undefined
  const message = typeof record.message === 'string' ? record.message : null
  if (!range || !message) return null

  return {
    range,
    severity: typeof record.severity === 'number' ? record.severity : undefined,
    code: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined,
    source: typeof record.source === 'string' ? record.source : undefined,
    message,
  }
}

function normalizeLocation(location: unknown): LspLocation | null {
  if (!location || typeof location !== 'object') return null
  const record = location as Record<string, unknown>
  const uri = typeof record.uri === 'string'
    ? record.uri
    : typeof record.targetUri === 'string'
      ? record.targetUri
      : null
  const range = (record.range ?? record.targetSelectionRange ?? record.targetRange) as LspLocation['range'] | undefined
  if (!uri || !range) return null
  return { uri, filePath: uriToFilePath(uri), range }
}

function normalizeCompletionItem(item: unknown): LspCompletionItem | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const label = typeof record.label === 'string' ? record.label : null
  if (!label) return null
  const textEdit = record.textEdit && typeof record.textEdit === 'object'
    ? record.textEdit as Record<string, unknown>
    : null

  return {
    label,
    kind: typeof record.kind === 'number' ? record.kind : undefined,
    detail: typeof record.detail === 'string' ? record.detail : undefined,
    documentation: textFromMarkup(record.documentation) ?? undefined,
    insertText: typeof record.insertText === 'string'
      ? record.insertText
      : typeof textEdit?.newText === 'string'
        ? textEdit.newText
        : undefined,
    filterText: typeof record.filterText === 'string' ? record.filterText : undefined,
    sortText: typeof record.sortText === 'string' ? record.sortText : undefined,
  }
}

class LspServiceImpl {
  private sessions = new Map<string, LspSession>()

  status(projectPath?: string): LspServerStatus[] {
    const rootPath = projectPath ? path.resolve(projectPath) : process.cwd()
    return SERVER_DEFINITIONS.map((definition) => {
      const commandPath = resolveCommand(definition.command, rootPath)
      const activeSession = Array.from(this.sessions.values()).find((session) =>
        session.definition.id === definition.id
        && (!projectPath || normalizePathForKey(session.projectPath) === normalizePathForKey(projectPath))
      )

      return {
        serverId: definition.id,
        label: definition.label,
        command: definition.command,
        commandPath,
        available: Boolean(commandPath),
        active: Boolean(activeSession && !activeSession.exited),
        pid: activeSession?.process.pid ?? null,
        projectPath: activeSession?.projectPath ?? null,
        languageIds: definition.languageIds,
        extensions: definition.extensions,
        startedAt: activeSession?.startedAt ?? null,
        error: activeSession?.lastError ?? (commandPath ? null : `${definition.command} was not found on PATH or in node_modules/.bin`),
      }
    })
  }

  async openDocument(input: LspDocumentInput): Promise<LspDocumentSyncResult> {
    const { projectPath, filePath } = this.validateDocumentInput(input)
    const languageId = toLspLanguageId(filePath, input.languageId)
    const definition = getDefinitionForDocument(filePath, languageId)
    if (!definition) {
      return { supported: false, languageId, error: `No LSP server configured for ${path.extname(filePath) || languageId}` }
    }

    const commandPath = resolveCommand(definition.command, projectPath)
    if (!commandPath) {
      return {
        supported: false,
        serverId: definition.id,
        languageId,
        error: `${definition.label} LSP is unavailable. Install ${definition.command} or add it to this project's dev dependencies.`,
      }
    }

    const session = await this.ensureSession(definition, projectPath, commandPath)
    const uri = filePathToUri(filePath)
    const existing = session.documents.get(uri)
    const version = input.version ?? ((existing?.version ?? 0) + 1)

    if (existing) {
      existing.version = version
      this.notify(session, 'textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text: input.text }],
      })
    } else {
      session.documents.set(uri, { uri, filePath, languageId, version })
      this.notify(session, 'textDocument/didOpen', {
        textDocument: { uri, languageId, version, text: input.text },
      })
    }

    return {
      supported: true,
      serverId: definition.id,
      languageId,
      status: this.sessionStatus(session),
    }
  }

  async changeDocument(input: LspDocumentInput): Promise<LspDocumentSyncResult> {
    return this.openDocument(input)
  }

  async closeDocument(input: Pick<LspDocumentInput, 'projectPath' | 'filePath' | 'languageId'>): Promise<void> {
    const { projectPath, filePath } = this.validateDocumentInput({ ...input, text: '' })
    const languageId = toLspLanguageId(filePath, input.languageId)
    const definition = getDefinitionForDocument(filePath, languageId)
    if (!definition) return

    const session = this.sessions.get(this.sessionKey(definition.id, projectPath))
    if (!session || session.exited) return

    const uri = filePathToUri(filePath)
    if (session.documents.delete(uri)) {
      this.notify(session, 'textDocument/didClose', { textDocument: { uri } })
    }

    session.diagnostics.delete(uri)
    broadcast('lsp:diagnostics', { uri, filePath, diagnostics: [] } satisfies LspDiagnosticEvent)
  }

  async hover(projectPath: string, filePath: string, languageId: string, position: LspPosition): Promise<LspHoverResult | null> {
    const session = await this.getReadySession(projectPath, filePath, languageId)
    if (!session) return null

    const result = await this.request(session, 'textDocument/hover', {
      textDocument: { uri: filePathToUri(filePath) },
      position,
    })
    if (!result || typeof result !== 'object') return null
    const record = result as Record<string, unknown>
    const contents = textFromMarkup(record.contents)
    if (!contents) return null
    return { contents, range: record.range as LspHoverResult['range'] | undefined }
  }

  async definition(projectPath: string, filePath: string, languageId: string, position: LspPosition): Promise<LspLocation[]> {
    const session = await this.getReadySession(projectPath, filePath, languageId)
    if (!session) return []

    const result = await this.request(session, 'textDocument/definition', {
      textDocument: { uri: filePathToUri(filePath) },
      position,
    })
    const rawLocations = Array.isArray(result) ? result : result ? [result] : []
    return rawLocations.map(normalizeLocation).filter((location): location is LspLocation => location !== null)
  }

  async completion(projectPath: string, filePath: string, languageId: string, position: LspPosition): Promise<LspCompletionResult> {
    const session = await this.getReadySession(projectPath, filePath, languageId)
    if (!session) return { items: [] }

    const result = await this.request(session, 'textDocument/completion', {
      textDocument: { uri: filePathToUri(filePath) },
      position,
      context: { triggerKind: 1 },
    })
    const items = Array.isArray(result)
      ? result
      : result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).items)
        ? (result as Record<string, unknown>).items as unknown[]
        : []
    return {
      items: items.map(normalizeCompletionItem).filter((item): item is LspCompletionItem => item !== null),
    }
  }

  diagnostics(filePath: string): LspDiagnosticEvent {
    if (!isPathSafe(filePath)) throw new Error('LSP file path is outside project boundaries')
    const uri = filePathToUri(filePath)
    for (const session of this.sessions.values()) {
      const diagnostics = session.diagnostics.get(uri)
      if (diagnostics) return { uri, filePath, diagnostics }
    }
    return { uri, filePath, diagnostics: [] }
  }

  shutdownProject(projectPath: string): void {
    const normalized = normalizePathForKey(projectPath)
    for (const [key, session] of this.sessions) {
      if (normalizePathForKey(session.projectPath) === normalized) {
        this.shutdownSession(key, session)
      }
    }
  }

  shutdownAll(): void {
    for (const [key, session] of this.sessions) {
      this.shutdownSession(key, session)
    }
  }

  private validateDocumentInput(input: LspDocumentInput): { projectPath: string; filePath: string } {
    const projectPath = path.resolve(input.projectPath)
    const filePath = path.resolve(input.filePath)
    if (!isProjectPathSafe(projectPath)) throw new Error('LSP project path is not registered')
    if (!isPathSafe(filePath)) throw new Error('LSP file path is outside project boundaries')
    return { projectPath, filePath }
  }

  private async getReadySession(projectPathInput: string, filePathInput: string, languageIdInput: string): Promise<LspSession | null> {
    const { projectPath, filePath } = this.validateDocumentInput({
      projectPath: projectPathInput,
      filePath: filePathInput,
      languageId: languageIdInput,
      text: '',
    })
    const languageId = toLspLanguageId(filePath, languageIdInput)
    const definition = getDefinitionForDocument(filePath, languageId)
    if (!definition) return null

    const session = this.sessions.get(this.sessionKey(definition.id, projectPath))
    if (!session || session.exited) return null
    await session.ready
    return session
  }

  private async ensureSession(definition: ServerDefinition, projectPath: string, commandPath: string): Promise<LspSession> {
    const key = this.sessionKey(definition.id, projectPath)
    const existing = this.sessions.get(key)
    if (existing && !existing.exited) {
      await existing.ready
      return existing
    }

    const child = spawn(commandPath, definition.args, {
      cwd: projectPath,
      env: { ...process.env } as NodeJS.ProcessEnv,
      stdio: 'pipe',
      windowsHide: true,
      shell: process.platform === 'win32' && ['.cmd', '.bat'].includes(path.extname(commandPath).toLowerCase()),
    }) as ChildProcessWithoutNullStreams

    const session: LspSession = {
      key,
      definition,
      projectPath,
      commandPath,
      process: child,
      buffer: Buffer.alloc(0),
      nextId: 1,
      pending: new Map(),
      documents: new Map(),
      diagnostics: new Map(),
      ready: Promise.resolve(),
      startedAt: Date.now(),
      exited: false,
      lastError: null,
    }

    child.stdout.on('data', (chunk: Buffer) => this.handleData(session, chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (!text) return
      session.lastError = text
      LogService.debug('LSP', `${definition.label} stderr`, { projectPath, text })
    })
    child.on('error', (error: Error) => {
      session.lastError = error.message
      LogService.warn('LSP', `${definition.label} process error`, { projectPath, error: error.message })
    })
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      session.exited = true
      session.lastError = `Exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`
      for (const pending of session.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error(session.lastError))
      }
      session.pending.clear()
      this.sessions.delete(key)
      LogService.info('LSP', `${definition.label} stopped`, { projectPath, code, signal })
    })

    session.ready = this.initialize(session)
    this.sessions.set(key, session)

    try {
      await session.ready
    } catch (error) {
      session.lastError = (error as Error).message
      this.shutdownSession(key, session)
      throw error
    }
    return session
  }

  private async initialize(session: LspSession): Promise<void> {
    await this.request(session, 'initialize', {
      processId: process.pid,
      clientInfo: { name: 'DAEMON', version: '3' },
      rootUri: filePathToUri(session.projectPath),
      rootPath: session.projectPath,
      workspaceFolders: [{
        uri: filePathToUri(session.projectPath),
        name: path.basename(session.projectPath),
      }],
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            didSave: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: false,
            codeDescriptionSupport: true,
            dataSupport: true,
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ['markdown', 'plaintext'],
          },
          definition: {
            dynamicRegistration: false,
            linkSupport: true,
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              documentationFormat: ['markdown', 'plaintext'],
              snippetSupport: false,
            },
          },
        },
        workspace: {
          configuration: true,
          workspaceFolders: true,
          didChangeConfiguration: { dynamicRegistration: false },
        },
      },
    })
    this.notify(session, 'initialized', {})
    LogService.info('LSP', `${session.definition.label} started`, {
      projectPath: session.projectPath,
      pid: session.process.pid,
      commandPath: session.commandPath,
    })
  }

  private sessionKey(serverId: string, projectPath: string): string {
    return `${serverId}:${normalizePathForKey(projectPath)}`
  }

  private sessionStatus(session: LspSession): LspServerStatus {
    return {
      serverId: session.definition.id,
      label: session.definition.label,
      command: session.definition.command,
      commandPath: session.commandPath,
      available: true,
      active: !session.exited,
      pid: session.process.pid ?? null,
      projectPath: session.projectPath,
      languageIds: session.definition.languageIds,
      extensions: session.definition.extensions,
      startedAt: session.startedAt,
      error: session.lastError,
    }
  }

  private request(session: LspSession, method: string, params?: unknown): Promise<unknown> {
    const id = session.nextId++
    const message: JsonRpcMessage = { jsonrpc: '2.0', id, method, params }
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, requestTimeoutMs)
      session.pending.set(id, { resolve, reject, timer })
    })
    this.write(session, message)
    return promise
  }

  private notify(session: LspSession, method: string, params?: unknown): void {
    this.write(session, { jsonrpc: '2.0', method, params })
  }

  private respond(session: LspSession, id: JsonRpcId, result: unknown): void {
    this.write(session, { jsonrpc: '2.0', id, result })
  }

  private write(session: LspSession, message: JsonRpcMessage): void {
    const body = JSON.stringify(message)
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`
    session.process.stdin.write(header + body)
  }

  private handleData(session: LspSession, chunk: Buffer): void {
    session.buffer = Buffer.concat([session.buffer, chunk])

    while (session.buffer.length > 0) {
      const separator = getBodySeparator(session.buffer)
      if (!separator) return

      const header = session.buffer.slice(0, separator.index).toString('utf8')
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i)
      if (!lengthMatch) {
        session.buffer = session.buffer.slice(separator.index + separator.length)
        continue
      }

      const bodyLength = Number(lengthMatch[1])
      const bodyStart = separator.index + separator.length
      const messageEnd = bodyStart + bodyLength
      if (session.buffer.length < messageEnd) return

      const rawBody = session.buffer.slice(bodyStart, messageEnd).toString('utf8')
      session.buffer = session.buffer.slice(messageEnd)

      try {
        this.handleMessage(session, JSON.parse(rawBody) as JsonRpcMessage)
      } catch (error) {
        LogService.warn('LSP', 'Failed to parse message', { error: (error as Error).message })
      }
    }
  }

  private handleMessage(session: LspSession, message: JsonRpcMessage): void {
    if (message.id !== undefined && !message.method) {
      const pending = session.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      session.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (!message.method) return

    if (message.method === 'textDocument/publishDiagnostics') {
      this.handleDiagnostics(session, message.params)
      return
    }

    if (message.id !== undefined) {
      this.handleServerRequest(session, message.id, message.method, message.params)
    }
  }

  private handleServerRequest(session: LspSession, id: JsonRpcId, method: string, _params: unknown): void {
    if (method === 'workspace/configuration') {
      const params = _params && typeof _params === 'object' ? _params as Record<string, unknown> : {}
      const items = Array.isArray(params.items) ? params.items : []
      this.respond(session, id, items.map(() => null))
      return
    }

    if (method === 'workspace/workspaceFolders') {
      this.respond(session, id, [{
        uri: filePathToUri(session.projectPath),
        name: path.basename(session.projectPath),
      }])
      return
    }

    if (method === 'client/registerCapability' || method === 'client/unregisterCapability') {
      this.respond(session, id, null)
      return
    }

    this.respond(session, id, null)
  }

  private handleDiagnostics(session: LspSession, params: unknown): void {
    if (!params || typeof params !== 'object') return
    const record = params as Record<string, unknown>
    if (typeof record.uri !== 'string') return

    const filePath = uriToFilePath(record.uri)
    if (!isPathSafe(filePath)) return

    const diagnostics = Array.isArray(record.diagnostics)
      ? record.diagnostics.map(normalizeDiagnostic).filter((item): item is LspDiagnostic => item !== null)
      : []

    session.diagnostics.set(record.uri, diagnostics)
    broadcast('lsp:diagnostics', { uri: record.uri, filePath, diagnostics } satisfies LspDiagnosticEvent)
  }

  private shutdownSession(key: string, session: LspSession): void {
    try {
      void this.request(session, 'shutdown')
        .catch(() => null)
        .finally(() => {
          try {
            this.notify(session, 'exit')
          } catch {
            // process may already be gone
          }
        })
    } catch {
      try {
        this.notify(session, 'exit')
      } catch {
        // process may already be gone
      }
    }

    setTimeout(() => {
      try {
        if (!session.process.killed) session.process.kill()
      } catch {
        // non-fatal
      }
    }, 750)
    this.sessions.delete(key)
  }
}

export const LspService = new LspServiceImpl()

export function getLspServerDefinitions(): ServerDefinition[] {
  return SERVER_DEFINITIONS
}

export function shutdownAllLspSessions(): void {
  LspService.shutdownAll()
}
