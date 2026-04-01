# DAEMON

**Type:** Electron IDE for AI-native development
**Owner:** nullxnothing
**Repo:** github.com/nullxnothing/daemon

## Core Value

A single-window IDE where solo developers ship with AI agents. Monaco editor, PTY terminals, Claude Code agent spawning, MCP management, Solana wallet, plugin system.

## Current Milestone: v0.2.0 Stabilization & Production Hardening

**Goal:** Address all findings from 7-agent audit (debugger, UX, code reviewer, performance, security, React, test coverage) to make DAEMON release-ready.

**Target outcomes:**
- Zero critical/high audit findings remaining
- Test coverage for all security-critical paths
- Lazy-loaded panels with code splitting
- Async I/O throughout main process
- GitPanel decomposed into maintainable sub-components
- File content decoupled from openFiles store array

## Validated Requirements (Already Built)

- Shell: Monaco editor, node-pty terminals, SQLite, file explorer, project tabs
- Agent Launcher: CRUD, spawn Claude Code CLI, terminal tabs with agent names
- Claude Panel: MCP management per project + global, usage stats, CLAUDE.md tools
- Process Manager, Env Manager, Ports Panel, Git Panel, Wallet Panel
- Settings Panel (API Keys, Integrations, Agents, Display)
- Tools Panel (browser, create, run, import)
- Production infrastructure (ErrorRecovery, ResourceManager, SagaOrchestrator, LogService, ValidationService)
- CI/CD: GitHub Actions for typecheck + test + build, release workflow
- Security: CSP headers, path validation, terminal cwd validation, PID allowlist

## Tech Stack

Electron 33, React 18, TypeScript, Vite, Monaco Editor, node-pty + xterm.js, Zustand, better-sqlite3, simple-git, electron-builder

## Last updated: 2026-03-31
