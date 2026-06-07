import { describe, expect, it } from 'vitest'
import { buildPatchProposal } from '../../electron/services/aria/patchUtils'

const CLEAN_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-const value = 1
+const value = 2
 export { value }
`

const SENSITIVE_DIFF = `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -0,0 +1,1 @@
+API_KEY=abc
`

describe('ARIA patch Guard integration', () => {
  it('attaches no findings and keeps heuristic risk for a clean patch', () => {
    const proposal = buildPatchProposal({ title: 'tweak', unifiedDiff: CLEAN_DIFF }, '/project')
    expect(proposal.guardFindings).toEqual([])
    expect(proposal.riskLevel).toBe('low')
  })

  it('surfaces a Guard finding and escalates risk for a sensitive-path patch', () => {
    const proposal = buildPatchProposal({ title: 'leak', unifiedDiff: SENSITIVE_DIFF }, '/project')
    expect(proposal.guardFindings.length).toBeGreaterThan(0)
    expect(proposal.guardFindings[0].code).toBe('sensitive_path')
    // Heuristic alone would be 'low' (1 file, tiny churn); Guard raises it.
    expect(proposal.riskLevel).toBe('blocked')
  })

  it('falls back to heuristic risk when the diff is unparseable', () => {
    const proposal = buildPatchProposal({ title: 'empty', unifiedDiff: 'not a diff' })
    expect(proposal.guardFindings).toEqual([])
    expect(proposal.riskLevel).toBe('low')
  })
})
