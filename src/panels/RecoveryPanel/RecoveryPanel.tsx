import { useEffect } from 'react'
import { useRecoveryStore } from '../../store/recovery'
import { RecoveryStatsBar } from './RecoveryStatsBar'
import { RecoveryControls } from './RecoveryControls'
import { RecoveryCanvas } from './RecoveryCanvas'
import { RecoveryLog } from './RecoveryLog'
import type { RecoveryProgressEvent } from '../../../electron/shared/types'
import './RecoveryPanel.css'

export function RecoveryPanel() {
  // Subscribe to IPC progress events from the main process
  // Use getState() to avoid re-subscribing on every store update
  useEffect(() => {
    const cleanup = window.daemon.recovery.onProgress((event: RecoveryProgressEvent) => {
      useRecoveryStore.getState().handleProgress(event)
    })
    return cleanup
  }, [])

  return (
    <div className="recovery-panel">
      <RecoveryStatsBar />
      <RecoveryControls />
      <div className="recovery-canvas-wrap">
        <RecoveryCanvas />
      </div>
      <RecoveryLog />
    </div>
  )
}
