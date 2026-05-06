import { useState, useEffect, useCallback } from 'react'

interface VaultFileMeta {
  id: string
  name: string
  file_type: string
  size_bytes: number
  owner_wallet: string | null
  created_at: number
}

const FILE_TYPE_LABELS: Record<string, string> = {
  keypair: 'Keypair',
  env: 'Env File',
  credential: 'Credential',
  seed_phrase: 'Seed Phrase',
  other: 'File',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function VaultSection({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<VaultFileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealId, setRevealId] = useState<string | null>(null)
  const [revealedData, setRevealedData] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [addName, setAddName] = useState('')
  const [addData, setAddData] = useState('')
  const [addType, setAddType] = useState('keypair')
  const [addSaving, setAddSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.daemon.vault.list()
    if (res.ok && res.data) setFiles(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleImportFile = async () => {
    setError(null)
    const res = await window.daemon.vault.importFile()
    if (!res.ok) { setError(res.error ?? 'Import failed'); return }
    if (!res.data) return // user cancelled

    const storeRes = await window.daemon.vault.store({
      name: res.data.name,
      data: res.data.data,
      fileType: res.data.fileType,
    })
    if (storeRes.ok) { await load(); return }
    setError(storeRes.error ?? 'Failed to store file')
  }

  const handleAdd = async () => {
    if (!addName.trim() || !addData.trim()) return
    setAddSaving(true)
    setError(null)
    const res = await window.daemon.vault.store({
      name: addName.trim(),
      data: addData.trim(),
      fileType: addType,
    })
    setAddSaving(false)
    if (res.ok) {
      setAddMode(false)
      setAddName('')
      setAddData('')
      await load()
      return
    }
    setError(res.error ?? 'Failed to store')
  }

  const handleReveal = async (id: string) => {
    if (revealId === id) {
      setRevealId(null)
      setRevealedData(null)
      setCopied(false)
      return
    }
    const res = await window.daemon.vault.retrieve(id)
    if (res.ok && res.data) {
      setRevealId(id)
      setRevealedData(res.data.data)
      setCopied(false)
    } else {
      setError(res.error ?? 'Failed to decrypt')
    }
  }

  const handleCopy = () => {
    if (!revealedData) return
    navigator.clipboard.writeText(revealedData)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async (id: string) => {
    const res = await window.daemon.vault.delete(id)
    if (res.ok) {
      setDeleteConfirm(null)
      if (revealId === id) { setRevealId(null); setRevealedData(null) }
      await load()
    } else {
      setError(res.error ?? 'Failed to delete')
    }
  }

  return (
    <div className="vault-section">
      <div className="vault-header">
        <button type="button" className="vault-back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="vault-title">Vault</span>
        <span className="vault-count">{files.length} file{files.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="vault-desc">
        Encrypted file storage. Files are encrypted at rest via OS keychain — they never exist as plaintext on disk.
      </div>

      {error && <div className="vault-error">{error}</div>}

      <div className="vault-actions">
        <button type="button" className="vault-btn primary" onClick={handleImportFile}>Import File</button>
        <button type="button" className="vault-btn" onClick={() => setAddMode(!addMode)}>
          {addMode ? 'Cancel' : 'Paste Secret'}
        </button>
      </div>

      {addMode && (
        <div className="vault-add-form">
          <input
            className="vault-input"
            placeholder="Name (e.g. devnet-keypair.json)"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />
          <select className="vault-select" value={addType} onChange={(e) => setAddType(e.target.value)}>
            <option value="keypair">Keypair</option>
            <option value="env">Env File</option>
            <option value="credential">Credential</option>
            <option value="seed_phrase">Seed Phrase</option>
            <option value="other">Other</option>
          </select>
          <textarea
            className="vault-textarea"
            placeholder="Paste content here..."
            value={addData}
            onChange={(e) => setAddData(e.target.value)}
            rows={4}
          />
          <button
            className="vault-btn primary"
            onClick={handleAdd}
            disabled={addSaving || !addName.trim() || !addData.trim()}
          >
            {addSaving ? 'Encrypting...' : 'Encrypt & Store'}
          </button>
        </div>
      )}

      {loading && files.length === 0 && <div className="vault-empty">Loading...</div>}
      {!loading && files.length === 0 && <div className="vault-empty">No files in vault</div>}

      <div className="vault-list">
        {files.map((file) => (
          <div key={file.id} className="vault-file-row">
            <div className="vault-file-info">
              <div className="vault-file-name">{file.name}</div>
              <div className="vault-file-meta">
                <span className="vault-file-type">{FILE_TYPE_LABELS[file.file_type] ?? file.file_type}</span>
                <span className="vault-file-size">{formatBytes(file.size_bytes)}</span>
                <span className="vault-file-time">{formatTime(file.created_at)}</span>
              </div>
            </div>
            <div className="vault-file-actions">
              <button
                className={`vault-btn-sm ${revealId === file.id ? 'active' : ''}`}
                onClick={() => handleReveal(file.id)}
              >
                {revealId === file.id ? 'Hide' : 'Reveal'}
              </button>
              {deleteConfirm === file.id ? (
                <>
                  <button type="button" className="vault-btn-sm danger" onClick={() => handleDelete(file.id)}>Confirm</button>
                  <button type="button" className="vault-btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="vault-btn-sm" onClick={() => setDeleteConfirm(file.id)}>Delete</button>
              )}
            </div>
            {revealId === file.id && revealedData && (
              <div className="vault-reveal">
                <pre className="vault-reveal-content">{revealedData}</pre>
                <button type="button" className="vault-btn-sm" onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
