import { useState } from 'react'
import { useOnboardingStore } from '../../../store/onboarding'
import { useWorkspaceProfileStore } from '../../../store/workspaceProfile'
import type { WorkspaceProfileName } from '../../../../electron/shared/types'

interface ProfileCardProps {
  name: WorkspaceProfileName
  label: string
  description: string
  icon: React.ReactNode
  selected: boolean
  onSelect: (name: WorkspaceProfileName) => void
}

function ProfileCard({ name, label, description, icon, selected, onSelect }: ProfileCardProps) {
  return (
    <button
      className={`step-profile-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(name)}
      type="button"
    >
      <div className="step-profile-icon">{icon}</div>
      <div className="step-profile-copy">
        <div className="step-profile-label">{label}</div>
        <div className="step-profile-desc">{description}</div>
      </div>
    </button>
  )
}

function MonitorIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function ChainIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function StepProfile() {
  const [selected, setSelected] = useState<WorkspaceProfileName | null>(null)
  const [saving, setSaving] = useState(false)
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)

  const handleSelect = (name: WorkspaceProfileName) => {
    setSelected(name)
  }

  const handleConfirm = async () => {
    if (!selected || saving) return
    setSaving(true)
    await useWorkspaceProfileStore.getState().setProfile(selected)
    setStepStatus('profile', 'complete')
    advanceStep()
    setSaving(false)
  }

  return (
    <div className="step-profile">
      <div className="step-profile-cards">
        <ProfileCard
          name="web"
          label="Web Development"
          description="Editor, Terminal, Git, Deploy, and web tools"
          icon={<MonitorIcon />}
          selected={selected === 'web'}
          onSelect={handleSelect}
        />
        <ProfileCard
          name="solana"
          label="Solana Development"
          description="Everything in Web plus Wallet, Token Launcher, and crypto tools"
          icon={<ChainIcon />}
          selected={selected === 'solana'}
          onSelect={handleSelect}
        />
        <ProfileCard
          name="custom"
          label="Custom"
          description="All tools visible, customize in Settings"
          icon={<GridIcon />}
          selected={selected === 'custom'}
          onSelect={handleSelect}
        />
      </div>

      <button
        className="wizard-btn primary"
        onClick={handleConfirm}
        disabled={!selected || saving}
      >
        {saving ? 'Saving...' : 'Continue'}
      </button>
    </div>
  )
}
