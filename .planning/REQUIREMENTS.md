# Requirements -- Milestone v0.2.0 Stabilization

## Performance

- [ ] **PERF-01**: Lazy-load all non-default panels with React.lazy + Suspense (EditorPanel and TerminalPanel stay eager)
- [ ] **PERF-02**: Split Monaco and xterm into separate vendor chunks via Vite manualChunks
- [ ] **PERF-03**: Replace all sync filesystem I/O in main process with async equivalents (fs.promises)
- [ ] **PERF-04**: GitPanel uses lightweight refreshStatus() (status only) after stage/unstage instead of full 4-IPC reload
- [ ] **PERF-05**: Decouple file content from openFiles Zustand array into a separate Map to eliminate expensive clones per keystroke

## Memory

- [ ] **MEM-01**: Dispose all Monaco models for a project when that project is removed or switched away
- [ ] **MEM-02**: Cap viewStateCache at 50 entries with LRU eviction

## Security

- [ ] **SEC-01**: Add sandbox: true to BrowserWindow webPreferences and verify preload still works
- [ ] **SEC-02**: Remove bypassCSP: true from monaco-editor and daemon-icon protocol registrations
- [ ] **SEC-03**: Add will-navigate handler on webContents to block all navigation away from app origin

## React Stability

- [ ] **REACT-01**: Add cancellation guards to all async IPC calls in useEffect (agents list, skills section, usage section)
- [ ] **REACT-02**: Wrap TerminalView in React.memo to prevent unnecessary re-renders in split pane layout
- [ ] **REACT-03**: Replace ternary chain in App.tsx center-area routing with a lookup map

## UX Polish

- [ ] **UX-01**: Add confirmation dialogs before destructive actions (API key delete, tool delete, branch checkout with uncommitted changes)
- [ ] **UX-02**: Add standalone "Commit" button separate from "Commit & Push" in GitPanel
- [ ] **UX-03**: Replace emoji wand button in GitPanel with SVG icon
- [ ] **UX-04**: Show placeholder in branch selector during initial load
- [ ] **UX-05**: Display "No tidy changes" as neutral info message, not error
- [ ] **UX-06**: Tool "Run" action stays on Tools panel instead of navigating to Claude
- [ ] **UX-07**: Add startingToolIds guard to prevent double-click spawning two terminals
- [ ] **UX-08**: Agent Launcher sidebar button shows active state when launcher is open

## Code Quality

- [ ] **CODE-01**: Decompose GitPanel into sub-components (StagingArea, CommitBar, BranchSelector, StashControls, CommitLog)
- [ ] **CODE-02**: Migrate remaining IPC handlers (filesystem, wallet, recovery, claude, env, ports, processes, settings, tweets, plugins) to ipcHandler factory

## Test Coverage

- [ ] **TEST-01**: pathValidation.test.ts -- path traversal, prefix attacks, empty projects, Windows normalization
- [ ] **TEST-02**: WalletService.test.ts -- address validation, default promotion on delete, project assignment
- [ ] **TEST-03**: EnvService.test.ts -- parse/write roundtrip, quote handling, export prefix, secret detection
- [ ] **TEST-04**: McpConfig.test.ts -- toggle/restore, corrupted JSON resilience, project vs global isolation
- [ ] **TEST-05**: ToolService.test.ts -- scaffold, import validation, deleteTool rmSync safety, buildRunCommand per language

## Traceability

| Requirement | Phase |
|-------------|-------|
| PERF-01..05 | TBD |
| MEM-01..02 | TBD |
| SEC-01..03 | TBD |
| REACT-01..03 | TBD |
| UX-01..08 | TBD |
| CODE-01..02 | TBD |
| TEST-01..05 | TBD |

## Future (Out of Scope for v0.2.0)

- Lazy-load the MonacoEditor component itself (complex due to worker setup)
- Batch IPC calls into single project:switch handler
- Move file content to IndexedDB for truly large files
- Redis-backed rate limiting for IPC
- Full e2e test suite with Playwright against packaged app
