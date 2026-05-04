# Performance Analysis & Fixes

## Critical Issues Fixed ✅

### 1. Git Diff Blocking Main Thread (FIXED)
**File**: `electron/ipc/claude.ts`  
**Problem**: `execSync('git diff HEAD~5')` blocked the Electron main process for up to **10 seconds** on every CLAUDE.md context read/generation  
**Impact**: UI completely frozen during agent launches and CLAUDE.md operations  
**Fix**:
- Replaced synchronous `execSync()` with async `exec()`
- Added 30-second cache with TTL to prevent repeated calls
- Reduced timeout from 10s → 5s
- Added 1MB maxBuffer limit to prevent memory issues

```typescript
// Before: Blocks main thread for 10s
diff = execSync('git diff HEAD~5', { cwd: projectPath, encoding: 'utf8', timeout: 10000 })

// After: Non-blocking + cached
const { stdout } = await execAsync('git diff HEAD~5', {
  cwd: projectPath,
  encoding: 'utf8',
  timeout: 5000,
  maxBuffer: 1024 * 1024,
})
diffCache.set(projectPath, { diff: stdout, timestamp: Date.now() })
```

### 2. Blank Panel Loading (FIXED)
**File**: `src/panels/Editor/Editor.tsx`  
**Problem**: Suspense fallback showed empty `<div>` during 4-6 second chunk loads  
**Impact**: Users saw completely blank panels, thought app was broken  
**Fix**: Added animated skeleton shimmer placeholder with 6 skeleton bars

## Remaining Performance Issues

### 3. Large Main Bundle (725KB in 6.2s)
**Cause**: All 30+ IPC handlers eagerly loaded in `electron/main/index.ts`  
**Impact**: 
- Slow cold starts
- Long HMR rebuild times (6+ seconds on every file change)
- Heavy memory footprint

**Recommendation**: Lazy-load non-critical IPC handlers
```typescript
// Instead of:
import { registerWalletHandlers } from '../ipc/wallet'
registerWalletHandlers() // Always loaded

// Consider:
ipcMain.handle('wallet:list', async () => {
  const { registerWalletHandlers } = await import('../ipc/wallet')
  registerWalletHandlers()
  // ... handle call
})
```

### 4. Synchronous File I/O in Hot Paths
**Files**: `codex.ts`, `browser.ts`, `filesystem.ts`, `vault.ts`  
**Problem**: 
- `fs.readFileSync()` - 17 occurrences
- `fs.writeFileSync()` - blocking writes
- `fs.statSync()` - blocks on stat calls
- `fs.existsSync()` - blocks on file checks

**Impact**: Main thread blocked during file operations  
**Recommendation**: Migrate to `fs/promises`

```typescript
// Before: Blocks main thread
const content = fs.readFileSync(mdPath, 'utf8')

// After: Non-blocking
const content = await fs.promises.readFile(mdPath, 'utf8')
```

### 5. npm prefix -g Repeated Calls
**Files**: `codex.ts`, `ClaudeRouter.ts`, `ClaudeProvider.ts`, `CodexProvider.ts`  
**Problem**: `execSync('npm prefix -g')` called multiple times with 3-10s timeout  
**Impact**: Multiple seconds blocked finding global npm path  
**Recommendation**: Cache result on first call

```typescript
let npmPrefixCache: string | null = null

async function getNpmPrefix(): Promise<string> {
  if (npmPrefixCache) return npmPrefixCache
  const { stdout } = await execAsync('npm prefix -g', { timeout: 3000 })
  npmPrefixCache = stdout.trim()
  return npmPrefixCache
}
```

### 6. IntegrationCommandCenter.tsx (104KB)
**File**: `src/panels/IntegrationCommandCenter/IntegrationCommandCenter.tsx`  
**Problem**: Massive 104KB single component  
**Impact**: Large chunk download/parse time  
**Recommendation**: Code-split integration actions into separate lazy chunks

## Performance Wins (Already Good)

✅ Better-sqlite3 configured with WAL mode, 32MB cache  
✅ Synchronous DB queries fast (<1ms) — not a bottleneck  
✅ Lazy loading for all workspace panels via `lazyWithReload`  
✅ Monaco workers offload syntax highlighting  
✅ React 18 automatic batching reduces re-renders  

## Expected Impact

**Before**: Git diff blocked UI for 5-10s on large repos  
**After**: Git diff non-blocking, cached, UI stays responsive  

**Before**: Panels appeared blank during load  
**After**: Animated skeleton shows loading progress  

**Remaining**: 6+ second build times due to large bundle — needs lazy IPC handler loading
