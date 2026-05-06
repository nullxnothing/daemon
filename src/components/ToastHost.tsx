import { useNotificationsStore, type Toast } from '../store/notifications'
import './ToastHost.css'

export function ToastHost() {
  const toasts = useNotificationsStore((s) => s.toasts)
  const dismiss = useNotificationsStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const handleAction = () => {
    toast.action?.onClick()
    onDismiss()
  }

  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span className="toast-dot" />
      <div className="toast-body">
        {toast.context && <div className="toast-context">{toast.context}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      {toast.action && (
        <button type="button" className="toast-action" onClick={handleAction}>
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
