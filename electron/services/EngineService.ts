import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { getDb } from '../db/db'
import { getRegisteredPorts } from './PortService'
import * as ClaudeRouter from './ClaudeRouter'
import type {
  EngineAction,
  EngineResult,
  EngineContext,
  Project,
} from '../shared/types'

// --- Context Builder ---

function buildContext(): EngineContext {
  const db = getDb()

  const projects = (db.prepare('SELECT * FROM projects ORDER BY last_active DESC').all() as Project[]).map((p) => {
    const claudeMdPath = path.join(p.path, 'CLAUDE.md')
    let gitBranch: string | null = null
    try {
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: p.path, encoding: 'utf8', timeout: 3000 }).trim()
    } catch {}

    const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM active_sessions WHERE project_id = ?').get(p.id) as { c: number }).c

    return {
      id: p.id,
      name: p.name,
      path: p.path,
      status: p.status,
      hasClaudeMd: fs.existsSync(claudeMdPath),
      gitBranch,
      activeSessions: sessionCount,
    }
  })

  const activeAgentRows = db.prepare(`
    SELECT a.id, a.name, s.project_id
    FROM active_sessions s
    JOIN agents a ON s.agent_id = a.id
    WHERE s.agent_id IS NOT NULL
  `).all() as Array<{ id: string; name: string; project_id: string | null }>

  const activeAgents = activeAgentRows.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.project_id,
  }))

  let recentErrors: Array<{ operation: string; message: string; timestamp: number }> = []
  try {
    recentErrors = db.prepare(
      'SELECT operation, message, timestamp FROM error_logs ORDER BY timestamp DESC LIMIT 10'
    ).all() as typeof recentErrors
  } catch {}

  let portMap: Array<{ port: number; serviceName: string; projectName: string }> = []
  try {
    portMap = getRegisteredPorts().map((p) => ({
      port: p.port,
      serviceName: p.serviceName,
      projectName: p.projectName,
    }))
  } catch {}

  let userProfile: Record<string, string> = {}
  try {
    const rows = db.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'user_%'").all() as Array<{ key: string; value: string }>
    for (const row of rows) userProfile[row.key] = row.value
  } catch {}

  return { projects, activeAgents, recentErrors, portMap, userProfile }
}

function contextToString(ctx: EngineContext): string {
  const sections: string[] = []

  sections.push('## Open Projects')
  if (ctx.projects.length === 0) {
    sections.push('(none)')
  } else {
    for (const p of ctx.projects) {
      const parts = [`- **${p.name}** (${p.path})`]
      parts.push(`  status=${p.status}, branch=${p.gitBranch ?? 'n/a'}, claude.md=${p.hasClaudeMd ? 'yes' : 'no'}, sessions=${p.activeSessions}`)
      sections.push(parts.join('\n'))
    }
  }

  if (ctx.activeAgents.length > 0) {
    sections.push('\n## Active Agents')
    for (const a of ctx.activeAgents) {
      sections.push(`- ${a.name} (project: ${a.projectId ?? 'global'})`)
    }
  }

  if (ctx.recentErrors.length > 0) {
    sections.push('\n## Recent Errors (last 10)')
    for (const e of ctx.recentErrors) {
      sections.push(`- [${new Date(e.timestamp * 1000).toISOString()}] ${e.operation}: ${e.message}`)
    }
  }

  if (ctx.portMap.length > 0) {
    sections.push('\n## Port Map')
    for (const p of ctx.portMap) {
      sections.push(`- :${p.port} → ${p.serviceName} (${p.projectName})`)
    }
  }

  return sections.join('\n')
}

// --- Engine System Prompt ---

const ENGINE_SYSTEM_PROMPT = `You are the DAEMON Engine — the core intelligence layer of a custom Electron IDE called DAEMON.

You have full awareness of all open projects, active agents, running services, and recent errors. You operate cross-project.

Your capabilities:
1. Fix and generate CLAUDE.md files for projects
2. Debug project setups (missing deps, broken configs, wrong paths)
3. Health-check all projects (git status, node_modules, build health)
4. Explain errors in context of the user's specific setup
5. Suggest fixes for issues across any open project
6. Answer free-form questions with full cross-project awareness

Rules:
- Be direct and concise
- When fixing files, return the complete fixed content
- When diagnosing, list concrete steps to resolve
- Never guess — if you need more info, say what you need
- Format output as markdown`

// --- Action Handlers ---

async function handleFixClaudeMd(action: EngineAction, ctx: EngineContext): Promise<EngineResult> {
  const project = ctx.projects.find((p) => p.id === action.projectId)
  if (!project) return { ok: false, action: action.type, error: 'Project not found' }

  const mdPath = path.join(project.path, 'CLAUDE.md')
  const currentContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''

  if (!currentContent.trim()) {
    return { ok: false, action: action.type, error: 'No CLAUDE.md exists. Use generate-claude-md instead.' }
  }

  let recentDiff = ''
  try {
    recentDiff = execSync('git diff HEAD~10 --stat', { cwd: project.path, encoding: 'utf8', timeout: 10000 })
  } catch {}

  let fileTree = ''
  try {
    fileTree = execSync('find . -maxdepth 2 -not -path "*/node_modules/*" -not -path "*/.git/*" | head -80', {
      cwd: project.path, encoding: 'utf8', timeout: 5000,
    })
  } catch {
    try {
      fileTree = execSync('dir /b /s /a:-d | findstr /v "node_modules .git" | head -80', {
        cwd: project.path, encoding: 'utf8', timeout: 5000,
      })
    } catch {}
  }

  const output = await ClaudeRouter.runPrompt({
    prompt: `Fix and update this project's CLAUDE.md. The project is "${project.name}" at ${project.path}.

Current CLAUDE.md:
\`\`\`
${currentContent}
\`\`\`

Recent changes (git diff --stat):
${recentDiff || '(no recent changes)'}

File tree (top 2 levels):
${fileTree || '(unavailable)'}

Return ONLY the complete updated CLAUDE.md content. Preserve existing structure. Fix inaccuracies, update stale sections, improve clarity.`,
    systemPrompt: ENGINE_SYSTEM_PROMPT,
    model: 'sonnet',
    effort: 'medium',
    cwd: project.path,
    timeoutMs: 90000,
  })

  return {
    ok: true,
    action: action.type,
    output: 'CLAUDE.md fix generated. Review and apply.',
    artifacts: { 'CLAUDE.md': output },
  }
}

async function handleGenerateClaudeMd(action: EngineAction, ctx: EngineContext): Promise<EngineResult> {
  const project = ctx.projects.find((p) => p.id === action.projectId)
  if (!project) return { ok: false, action: action.type, error: 'Project not found' }

  let packageJson = ''
  try {
    packageJson = fs.readFileSync(path.join(project.path, 'package.json'), 'utf8')
  } catch {}

  let cargoToml = ''
  try {
    cargoToml = fs.readFileSync(path.join(project.path, 'Cargo.toml'), 'utf8')
  } catch {}

  let fileTree = ''
  try {
    fileTree = execSync('find . -maxdepth 3 -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/target/*" | head -100', {
      cwd: project.path, encoding: 'utf8', timeout: 5000,
    })
  } catch {
    try {
      fileTree = execSync('dir /b /s /a:-d | findstr /v "node_modules .git target" | head -100', {
        cwd: project.path, encoding: 'utf8', timeout: 5000,
      })
    } catch {}
  }

  let gitLog = ''
  try {
    gitLog = execSync('git log --oneline -20', { cwd: project.path, encoding: 'utf8', timeout: 5000 })
  } catch {}

  const output = await ClaudeRouter.runPrompt({
    prompt: `Generate a CLAUDE.md for the project "${project.name}" at ${project.path}.

package.json:
${packageJson || '(none)'}

Cargo.toml:
${cargoToml || '(none)'}

File tree (top 3 levels):
${fileTree || '(unavailable)'}

Recent git history:
${gitLog || '(no git history)'}

Generate a comprehensive CLAUDE.md that covers:
- What the project is
- Tech stack
- Key commands (dev, build, test, deploy)
- Folder structure overview
- Important patterns/conventions
- Known gotchas

Return ONLY the markdown content.`,
    systemPrompt: ENGINE_SYSTEM_PROMPT,
    model: 'sonnet',
    effort: 'high',
    cwd: project.path,
    timeoutMs: 120000,
  })

  return {
    ok: true,
    action: action.type,
    output: 'CLAUDE.md generated. Review and apply.',
    artifacts: { 'CLAUDE.md': output },
  }
}

async function handleDebugSetup(action: EngineAction, ctx: EngineContext): Promise<EngineResult> {
  const project = ctx.projects.find((p) => p.id === action.projectId)
  if (!project) return { ok: false, action: action.type, error: 'Project not found' }

  const checks: string[] = []

  // Check node_modules
  const hasNodeModules = fs.existsSync(path.join(project.path, 'node_modules'))
  checks.push(`node_modules: ${hasNodeModules ? 'exists' : 'MISSING'}`)

  // Check package.json
  const hasPackageJson = fs.existsSync(path.join(project.path, 'package.json'))
  checks.push(`package.json: ${hasPackageJson ? 'exists' : 'MISSING'}`)

  // Check .env
  const hasEnv = fs.existsSync(path.join(project.path, '.env'))
  checks.push(`.env: ${hasEnv ? 'exists' : 'not found'}`)

  // Check git
  const hasGit = fs.existsSync(path.join(project.path, '.git'))
  checks.push(`git: ${hasGit ? 'initialized' : 'NOT a git repo'}`)

  // Check CLAUDE.md
  checks.push(`CLAUDE.md: ${project.hasClaudeMd ? 'exists' : 'MISSING'}`)

  // Check .claude/settings.json
  const hasClaudeSettings = fs.existsSync(path.join(project.path, '.claude', 'settings.json'))
  checks.push(`.claude/settings.json: ${hasClaudeSettings ? 'exists' : 'not found'}`)

  // TypeScript check
  let tsErrors = ''
  if (hasPackageJson) {
    try {
      execSync('npx tsc --noEmit 2>&1', { cwd: project.path, encoding: 'utf8', timeout: 30000 })
      checks.push('TypeScript: clean')
    } catch (err) {
      tsErrors = (err as { stdout?: string }).stdout ?? ''
      const errorCount = (tsErrors.match(/error TS/g) ?? []).length
      checks.push(`TypeScript: ${errorCount} errors`)
    }
  }

  // Git status
  let gitStatus = ''
  try {
    gitStatus = execSync('git status --porcelain', { cwd: project.path, encoding: 'utf8', timeout: 5000 })
  } catch {}

  const extraContext = (action.payload?.question as string) ?? ''

  const output = await ClaudeRouter.runPrompt({
    prompt: `Debug the setup for project "${project.name}" at ${project.path}.

Automated checks:
${checks.join('\n')}

Git status:
${gitStatus || '(clean or no git)'}

${tsErrors ? `TypeScript errors (first 2000 chars):\n${tsErrors.slice(0, 2000)}` : ''}

${extraContext ? `User question: ${extraContext}` : ''}

Diagnose issues and provide concrete steps to fix each one. Be specific — include exact commands to run.`,
    systemPrompt: ENGINE_SYSTEM_PROMPT,
    model: 'sonnet',
    effort: 'medium',
    cwd: project.path,
    timeoutMs: 60000,
  })

  return { ok: true, action: action.type, output }
}

async function handleHealthCheck(ctx: EngineContext): Promise<EngineResult> {
  const summaries: string[] = []

  for (const project of ctx.projects) {
    const issues: string[] = []

    if (!fs.existsSync(path.join(project.path, 'node_modules')) && fs.existsSync(path.join(project.path, 'package.json'))) {
      issues.push('node_modules missing')
    }
    if (!project.hasClaudeMd) issues.push('no CLAUDE.md')

    try {
      const status = execSync('git status --porcelain', { cwd: project.path, encoding: 'utf8', timeout: 3000 })
      const uncommitted = status.trim().split('\n').filter(Boolean).length
      if (uncommitted > 20) issues.push(`${uncommitted} uncommitted changes`)
    } catch {}

    const statusIcon = issues.length === 0 ? 'OK' : `${issues.length} issue(s)`
    summaries.push(`- **${project.name}** [${statusIcon}]${issues.length > 0 ? ': ' + issues.join(', ') : ''}`)
  }

  const output = `# Health Check\n\n${summaries.join('\n')}\n\n${ctx.projects.length} project(s) scanned.`
  return { ok: true, action: 'health-check', output }
}

async function handleExplainError(action: EngineAction, ctx: EngineContext): Promise<EngineResult> {
  const errorText = action.payload?.error as string
  if (!errorText) return { ok: false, action: action.type, error: 'No error text provided' }

  const project = action.projectId ? ctx.projects.find((p) => p.id === action.projectId) : null

  const output = await ClaudeRouter.runPrompt({
    prompt: `Explain this error and suggest a fix.

Error:
${errorText}

${project ? `Project: ${project.name} at ${project.path} (branch: ${project.gitBranch ?? 'n/a'})` : 'No specific project context.'}

Explain what caused this, why, and how to fix it. Include exact commands to resolve.`,
    systemPrompt: ENGINE_SYSTEM_PROMPT,
    model: 'haiku',
    effort: 'low',
    timeoutMs: 60000,
  })

  return { ok: true, action: action.type, output }
}

async function handleSuggestFix(action: EngineAction, ctx: EngineContext): Promise<EngineResult> {
  const description = action.payload?.description as string
  if (!description) return { ok: false, action: action.type, error: 'No description provided' }

  const project = action.projectId ? ctx.projects.find((p) => p.id === action.projectId) : null

  const output = await ClaudeRouter.runPrompt({
    prompt: `Suggest a fix for the following issue.

Issue: ${description}

${project ? `Project: ${project.name} at ${project.path}` : ''}

Provide a concrete, step-by-step fix. Include exact file paths and commands where applicable.`,
    systemPrompt: ENGINE_SYSTEM_PROMPT,
    model: 'haiku',
    effort: 'low',
    timeoutMs: 60000,
  })

  return { ok: true, action: action.type, output }
}

async function handleAsk(action: EngineAction, ctx: EngineContext): Promise<EngineResult> {
  const question = action.payload?.question as string
  if (!question) return { ok: false, action: action.type, error: 'No question provided' }

  const project = action.projectId ? ctx.projects.find((p) => p.id === action.projectId) : null

  // Compact context: just project list
  const projectList = ctx.projects.map((p) => `- ${p.name} (${p.path}) [${p.status}, branch=${p.gitBranch ?? 'n/a'}, claude.md=${p.hasClaudeMd}]`).join('\n')

  const output = await ClaudeRouter.runPrompt({
    prompt: `${question}

Open projects:
${projectList}

${project ? `Active project: ${project.name} at ${project.path}` : ''}`,
    systemPrompt: ENGINE_SYSTEM_PROMPT,
    model: 'sonnet',
    effort: 'low',
    timeoutMs: 60000,
  })

  return { ok: true, action: action.type, output }
}

// --- Public API ---

export async function runAction(action: EngineAction): Promise<EngineResult> {
  const ctx = buildContext()

  switch (action.type) {
    case 'fix-claude-md':
      return handleFixClaudeMd(action, ctx)
    case 'generate-claude-md':
      return handleGenerateClaudeMd(action, ctx)
    case 'debug-setup':
      return handleDebugSetup(action, ctx)
    case 'health-check':
      return handleHealthCheck(ctx)
    case 'explain-error':
      return handleExplainError(action, ctx)
    case 'suggest-fix':
      return handleSuggestFix(action, ctx)
    case 'ask':
      return handleAsk(action, ctx)
    default:
      return { ok: false, action: action.type, error: `Unknown action: ${action.type}` }
  }
}

export function getContext(): EngineContext {
  return buildContext()
}
