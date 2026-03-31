import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../../store/ui'
import { TweetVariations } from './TweetVariations'
import { DraftList } from './DraftList'
import { VoiceProfileEditor } from './VoiceProfileEditor'
import '../plugin.css'
import './TweetGenerator.css'

type TweetMode = 'original' | 'reply' | 'quote'

interface TweetVariation {
  id: string
  content: string
  isEditing: boolean
  editContent: string
  copied: boolean
}

export default function TweetGenerator() {
  const [mode, setMode] = useState<TweetMode>('original')
  const [prompt, setPrompt] = useState('')
  const [sourceTweet, setSourceTweet] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variations, setVariations] = useState<TweetVariation[]>([])

  // Recent drafts
  const [drafts, setDrafts] = useState<Tweet[]>([])

  // Voice profile
  const [voicePrompt, setVoicePrompt] = useState('')
  const [voiceExamples, setVoiceExamples] = useState<string[]>([])
  const [isEditingVoice, setIsEditingVoice] = useState(false)

  const loadDrafts = useCallback(async () => {
    const res = await window.daemon.tweets.list(30)
    if (res.ok && res.data) setDrafts(res.data)
  }, [])

  const loadVoice = useCallback(async () => {
    const res = await window.daemon.tweets.voiceGet()
    if (res.ok && res.data) {
      setVoicePrompt(res.data.system_prompt)
      try {
        setVoiceExamples(JSON.parse(res.data.examples))
      } catch {
        setVoiceExamples([])
      }
    }
  }, [])

  useEffect(() => {
    loadDrafts()
    loadVoice()
  }, [loadDrafts, loadVoice])

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    setError(null)
    setVariations([])

    const res = await window.daemon.tweets.generate(
      prompt.trim(),
      mode,
      mode !== 'original' ? sourceTweet.trim() : undefined,
    )

    if (res.ok && res.data) {
      const { tweets, draftPath } = res.data
      setVariations(
        tweets.map((t) => ({
          id: t.id,
          content: t.content,
          isEditing: false,
          editContent: t.content,
          copied: false,
        })),
      )
      loadDrafts()

      // Open the draft .md file in the editor canvas
      if (draftPath) {
        const readRes = await window.daemon.fs.readFile(draftPath)
        if (readRes.ok && readRes.data) {
          const fileName = draftPath.split(/[/\\]/).pop() ?? 'tweets.md'
          const projectId = useUIStore.getState().activeProjectId ?? '__drafts'
          useUIStore.getState().openFile({
            path: draftPath,
            name: fileName,
            content: readRes.data.content,
            projectId,
          })
        }
      }
    } else {
      setError(res.error ?? 'Generation failed')
    }

    setIsGenerating(false)
  }

  const handleCopy = async (idx: number) => {
    const v = variations[idx]
    await navigator.clipboard.writeText(v.content)
    const updateRes = await window.daemon.tweets.update(v.id, { status: 'selected' })
    if (!updateRes.ok) console.error('Failed to update tweet status:', updateRes.error)

    setVariations((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, copied: true } : item)),
    )
    setTimeout(() => {
      setVariations((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, copied: false } : item)),
      )
    }, 1500)
    loadDrafts()
  }

  const handleToggleEdit = (idx: number) => {
    setVariations((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, isEditing: !item.isEditing, editContent: item.content } : item,
      ),
    )
  }

  const handleEditChange = (idx: number, value: string) => {
    setVariations((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, editContent: value } : item,
      ),
    )
  }

  const handleSaveEdit = async (idx: number) => {
    const v = variations[idx]
    const res = await window.daemon.tweets.update(v.id, { content: v.editContent })
    if (!res.ok) { console.error('Failed to save tweet edit:', res.error); return }
    setVariations((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, content: item.editContent, isEditing: false } : item,
      ),
    )
    loadDrafts()
  }

  const handleDraftStatus = async (id: string, status: string) => {
    const res = await window.daemon.tweets.update(id, { status })
    if (!res.ok) console.error('Failed to update draft status:', res.error)
    loadDrafts()
  }

  const handleDraftDelete = async (id: string) => {
    const res = await window.daemon.tweets.delete(id)
    if (!res.ok) console.error('Failed to delete draft:', res.error)
    loadDrafts()
  }

  const handleSaveVoice = async () => {
    const res = await window.daemon.tweets.voiceUpdate(voicePrompt, voiceExamples)
    if (!res.ok) { console.error('Failed to save voice profile:', res.error); return }
    setIsEditingVoice(false)
  }

  return (
    <div className="plugin-panel tweet-gen">
      <div className="panel-header">TWEETS</div>

      <div className="tweet-gen__body">
        <TweetVariations
          mode={mode}
          onModeChange={setMode}
          sourceTweet={sourceTweet}
          onSourceTweetChange={setSourceTweet}
          prompt={prompt}
          onPromptChange={setPrompt}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          error={error}
          variations={variations}
          onEditChange={handleEditChange}
          onToggleEdit={handleToggleEdit}
          onSaveEdit={handleSaveEdit}
          onCopy={handleCopy}
        />

        <div className="tweet-gen__divider" />

        <DraftList
          drafts={drafts}
          onStatusChange={handleDraftStatus}
          onDelete={handleDraftDelete}
        />

        <div className="tweet-gen__divider" />

        <VoiceProfileEditor
          voicePrompt={voicePrompt}
          onVoicePromptChange={setVoicePrompt}
          voiceExamples={voiceExamples}
          onVoiceExamplesChange={setVoiceExamples}
          isEditing={isEditingVoice}
          onEditingChange={setIsEditingVoice}
          onSave={handleSaveVoice}
        />
      </div>
    </div>
  )
}
