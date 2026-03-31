# CLAUDE_FLAGS.md
*Verified from official Anthropic docs and current CLI reference — March 2026*
*This is the source of truth for Claude Code CLI flags used by NULLPAD's ClaudeManager.ts*
*Do not use flags not listed here. Do not guess flag names.*

---

## Critical Finding: Two Flags in the Master Plan Do Not Exist

| Flag in Master Plan | Reality | Correct Approach |
|---|---|---|
| `--mcp <server-name>` | **Does not exist** | Configure MCPs in `.claude/settings.json` per project |
| `--context-file <path>` | **Does not exist** | Use `--append-system-prompt-file <path>` instead |

**This breaks the `buildClaudeCommand()` function as written. See corrected implementation below.**

---

## Verified CLI Flags

### Session Control

| Flag | Description | Example |
|---|---|---|
| `-c` / `--continue` | Resume most recent session in cwd | `claude -c` |
| `-r <session-id>` | Resume specific session by ID | `claude -r abc123` |
| `--max-turns <n>` | Limit turns (non-interactive mode only) | `claude -p --max-turns 10 "fix bugs"` |

### Model Selection

| Flag | Description | Example |
|---|---|---|
| `--model <model>` | Specify model | `claude --model claude-opus-4-20250514` |

**Verified model strings:**
```
claude-opus-4-20250514       # Full string
claude-sonnet-4-20250514     # Full string  
claude-haiku-4-5-20251001    # Full string
opus                         # Shorthand (works)
sonnet                       # Shorthand (works)
haiku                        # Shorthand (works)
```

### Non-Interactive / Scripted Mode

| Flag | Description | Example |
|---|---|---|
| `-p "prompt"` | One-shot query, exits after completion | `claude -p "run tests"` |
| `--output-format` | Output format for `-p` mode | `--output-format json` |

`--output-format` values: `text` (default), `json`, `stream-json`

### System Prompt Control

**Four flags exist. Two pairs: replace vs. append.**

| Flag | Behavior | When to Use |
|---|---|---|
| `--system-prompt "text"` | **Replaces** Claude Code's entire system prompt | Full control needed |
| `--system-prompt-file <path>` | **Replaces** from file | Full control, long prompt |
| `--append-system-prompt "text"` | **Appends** to Claude Code's default prompt | Most cases — preserves built-in behavior |
| `--append-system-prompt-file <path>` | **Appends** from file | Most cases, long prompt |

`--system-prompt` and `--system-prompt-file` are mutually exclusive.
Append flags can be combined with either replace flag.

**For NULLPAD agent spawning: use `--append-system-prompt-file`.** This preserves Claude Code's built-in coding capabilities while adding the agent's persona and project context.

### Permission Control

| Flag | Description | When to Use |
|---|---|---|
| `--dangerously-skip-permissions` | Skips all permission prompts | Overnight Engine only, inside isolated context |
| `--allowedTools "T1,T2"` | Whitelist specific tools | Locked-down agents (e.g., read-only audit) |
| `--disallowedTools "T1"` | Block specific tools | Overnight agents that shouldn't push |

**Tool names for `--allowedTools` / `--disallowedTools`:**
```
Read          Write         Edit
Bash          Grep          Glob
WebSearch     WebFetch      Agent
```

Bash can be scoped: `Bash(git *)` allows only git commands. `Bash(npm test:*)` allows only test runs.

### Effort Control

| Flag | Values | Description |
|---|---|---|
| `--effort` | `low`, `medium`, `high`, `max` | Controls thinking depth and token usage |

Use `low` for Git Agent and Tweet gen. Use `high` or `max` for Security Audit and Overnight Engine.

### Sub-Agent Definition

```bash
claude --agents '{
  "reviewer": {
    "description": "Reviews code changes",
    "prompt": "Review for security and correctness. Report issues only, do not fix.",
    "tools": ["Read", "Grep", "Glob"],
    "model": "sonnet"
  }
}'
```

**Note:** This defines sub-agents within a single Claude session, not the same as spawning separate Claude instances in separate terminals. For NULLPAD's terminal-per-agent model, spawn separate `claude` processes via node-pty.

---

## How MCP Actually Works (Not Flags)

MCP servers are **not** passed as CLI flags. They are configured in settings files and persist across sessions.

### Global MCP (available to all projects)
```bash
# Add once — persists in ~/.claude/settings.json
claude mcp add filesystem npx @modelcontextprotocol/server-filesystem /
claude mcp add github -e GITHUB_TOKEN=your-token -- npx @modelcontextprotocol/server-github
claude mcp add helius -- node /path/to/helius-mcp/index.js

# Verify
claude mcp list
```

### Per-Project MCP (project-scoped)
```json
// .claude/settings.json in project root
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "."]
    }
  },
  "permissions": {
    "allowedTools": ["Read", "Write", "Bash(git *)"]
  }
}
```

### NULLPAD's MCP Strategy

Since MCPs can't be passed per-spawn, NULLPAD manages them this way:

1. **Global MCPs** (filesystem, GitHub, Helius) — configured once at onboarding via `claude mcp add`
2. **Project MCPs** — written to `.claude/settings.json` in each project directory when agent is assigned
3. **MCP toggle UI** — when user toggles an MCP on/off, NULLPAD rewrites the project's `.claude/settings.json` and optionally `~/.claude/claude_desktop_config.json`

---

## Corrected `buildClaudeCommand()` for ClaudeManager.ts

The original version in the master plan uses flags that don't exist. Here is the corrected implementation:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  mcps: string;           // JSON array: ["filesystem","github"]
  shortcut?: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
  session_summary?: string;
}

export function buildClaudeCommand(agent: Agent, project: Project): {
  command: string;
  args: string[];
  contextFilePath: string;
} {
  // 1. Write context to temp file (this is what --context-file was meant to do)
  //    Use --append-system-prompt-file instead — this flag actually exists
  const portMap = getProjectPortMap(project.id);
  
  const contextContent = [
    agent.system_prompt,
    '',
    `--- NULLPAD CONTEXT ---`,
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    portMap ? `Port map: ${portMap}` : '',
    project.session_summary ? `Last session summary: ${project.session_summary}` : '',
    `--- END CONTEXT ---`,
  ].filter(Boolean).join('\n');

  const contextFilePath = path.join(
    os.tmpdir(),
    `nullpad_agent_${agent.id}_${Date.now()}.txt`
  );
  fs.writeFileSync(contextFilePath, contextContent, 'utf8');

  // 2. Write MCPs to project's .claude/settings.json
  //    MCPs are not CLI flags — they live in the project settings file
  writeProjectMcpSettings(project.path, JSON.parse(agent.mcps));

  // 3. Build the actual command
  const args: string[] = [
    '--model', agent.model,
    '--append-system-prompt-file', contextFilePath,
  ];

  // For overnight/automated agents only — never for interactive sessions
  // if (isAutomated) args.push('--dangerously-skip-permissions');

  return {
    command: 'claude',
    args,
    contextFilePath, // caller is responsible for cleanup on session end
  };
}

function writeProjectMcpSettings(projectPath: string, mcps: string[]) {
  const settingsDir = path.join(projectPath, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }
  
  // Read existing settings if present
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {}
  }
  
  // Build mcpServers block from agent's MCP list
  // Actual MCP server configs are stored in SQLite (mcp_servers table)
  // and looked up by name here
  const mcpServers = buildMcpServersBlock(mcps);
  
  const updated = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers as object ?? {}),
      ...mcpServers,
    },
  };
  
  fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
}
```

---

## Spawn Pattern in node-pty (Terminal IPC)

```typescript
// electron/ipc/terminal.ts

import * as pty from 'node-pty';
import { buildClaudeCommand } from '../services/ClaudeManager';

ipcMain.handle('agents:spawn', async (_event, { agentId, projectId }) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  
  if (!agent || !project) return { ok: false, error: 'agent or project not found' };
  
  const { command, args, contextFilePath } = buildClaudeCommand(agent, project);
  
  const ptyProcess = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: project.path,       // ALWAYS the project path — never NULLPAD's cwd
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      NULLPAD_PROJECT_ID: project.id,
      NULLPAD_AGENT_ID: agent.id,
    }
  });
  
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { pty: ptyProcess, contextFilePath });
  
  ptyProcess.onExit(() => {
    // Clean up temp context file
    try { fs.unlinkSync(contextFilePath); } catch {}
    sessions.delete(sessionId);
    db.prepare('DELETE FROM active_sessions WHERE id = ?').run(sessionId);
  });
  
  db.prepare(
    'INSERT INTO active_sessions (id, project_id, agent_id, pid, started_at) VALUES (?,?,?,?,?)'
  ).run(sessionId, project.id, agent.id, ptyProcess.pid, Date.now());
  
  return { ok: true, data: { sessionId } };
});
```

---

## MCP Toggle (Claude Panel)

When the user toggles an MCP server on/off in the Claude panel:

```typescript
// electron/services/McpConfig.ts

export function toggleMcp(projectPath: string, mcpName: string, enabled: boolean) {
  const settingsPath = path.join(projectPath, '.claude', 'settings.json');
  const settings = readSettings(settingsPath);
  
  if (enabled) {
    // Add MCP config from NULLPAD's known servers registry
    const mcpConfig = db.prepare('SELECT * FROM mcp_registry WHERE name = ?').get(mcpName);
    settings.mcpServers = settings.mcpServers ?? {};
    settings.mcpServers[mcpName] = JSON.parse(mcpConfig.config);
  } else {
    // Remove from project settings
    delete settings.mcpServers?.[mcpName];
  }
  
  writeSettings(settingsPath, settings);
  // Note: Claude Code picks up settings.json changes on next session start.
  // There is no "reload MCP" flag — user must restart the Claude session.
}
```

**UI implication:** After toggling an MCP, show a "Restart session to apply" indicator in the Claude panel. The Restart Claude button kills and respawns the active PTY — that's when the new settings.json is read.

---

## Slash Commands Available Inside Sessions

These are typed inside a running Claude session (not CLI flags at launch):

| Command | Description |
|---|---|
| `/clear` | Clear conversation history, free context |
| `/compact` | Summarize history, keep context space |
| `/cost` | Show token usage and spend for session |
| `/model` | Switch model mid-session |
| `/plan` | Enter plan mode (read-only, propose only) |
| `/review` | Review recent code changes |
| `/permissions` | View/change tool permissions |
| `/init` | Generate CLAUDE.md for current project |
| `/help` | Full command list |

**NULLPAD can inject slash commands programmatically** by writing to the PTY:
```typescript
// Inject /compact before context window fills
ptyProcess.write('/compact\r');

// Inject /cost to capture spend at session end
ptyProcess.write('/cost\r');
```

---

## Effort Mapping for NULLPAD Agents

| Agent | Model | Effort | Reason |
|---|---|---|---|
| NULLPAD Debug | claude-opus-4-20250514 | `high` | Complex architecture diagnosis |
| Security Audit | claude-opus-4-20250514 | `high` | Thorough analysis needed |
| Code Review | claude-sonnet-4-20250514 | `medium` | Balanced speed/depth |
| Git Agent | claude-haiku-4-5-20251001 | `low` | Simple, fast, cheap |
| Test Runner | claude-haiku-4-5-20251001 | `low` | Report only, no reasoning needed |
| Tweet Generator | claude-haiku-4-5-20251001 | `low` | Short-form, fast |
| Overnight Engine | claude-sonnet-4-20250514 | `high` | Multi-phase, quality matters |
| ARIA (fast ops) | claude-haiku-4-5-20251001 | `low` | Parsing, routing, quick decisions |
| ARIA (complex) | claude-opus-4-20250514 | `high` | Multi-project orchestration |

---

## Environment Variables (Relevant to NULLPAD)

Set in the spawned Claude process env or in project `.claude/settings.json` under `"env"`:

| Variable | Effect |
|---|---|
| `ANTHROPIC_MODEL` | Override default model |
| `CLAUDE_CODE_EFFORT_LEVEL` | Override effort level |
| `BASH_DEFAULT_TIMEOUT_MS` | Timeout for bash commands (default 30000) |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Cap output tokens |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Disable auto memory feature |

---

## What to Remove/Fix in the Master Plan

1. **`buildClaudeCommand()`** — Remove `--mcp` flag usage. Replace with `writeProjectMcpSettings()` pattern above.
2. **`--context-file`** — Replace with `--append-system-prompt-file` pointing to temp file.
3. **MCP toggle UI** — Writes to `.claude/settings.json`, not `claude_desktop_config.json`. The `claude_desktop_config.json` is for the Claude Desktop *app*, not Claude Code CLI.
4. **Agent model names** — Update `claude-opus-4` to `claude-opus-4-20250514` (versioned strings are more reliable than shorthand in automated contexts).
5. **"Restart Claude" button** — This works correctly via PTY kill/respawn. Just be clear in the UI that MCP changes require session restart.

---

*Source: Anthropic official docs at docs.anthropic.com/en/docs/claude-code/cli-reference and community references — March 2026*
*Update this file whenever you run `claude --help` and see new flags.*
