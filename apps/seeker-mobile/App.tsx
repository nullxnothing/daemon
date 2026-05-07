import { useEffect, useMemo, useState } from 'react'
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { demoProject } from './src/data/demo'
import { useApprovalQueue } from './src/hooks/useApprovalQueue'
import { useDesktopRelay } from './src/hooks/useDesktopRelay'
import { usePairingSession } from './src/hooks/usePairingSession'
import { useSeekerNotifications } from './src/hooks/useSeekerNotifications'
import { useSeekerWallet } from './src/hooks/useSeekerWallet'
import type { ApprovalRequest, ApprovalRisk, PairingSession } from './src/types'

type TabId = 'home' | 'approvals' | 'wallet' | 'pair'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'pair', label: 'Pair' },
]

function riskColor(risk: ApprovalRisk) {
  if (risk === 'high') return '#ff7066'
  if (risk === 'medium') return '#f0b429'
  return '#14f195'
}

function shortAddress(address: string | null) {
  if (!address) return 'Not connected'
  if (address.length <= 12) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

function relayBaseUrl(relayUrl: string) {
  return relayUrl.trim().replace(/\/$/, '')
}

async function sendPairEvent(nextSession: PairingSession) {
  const base = relayBaseUrl(nextSession.relayUrl)
  if (!base) return { ok: false, error: 'Missing relay URL' }

  try {
    const res = await fetch(`${base}/api/seeker/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'pair',
        sessionCode: nextSession.pairingCode,
        payload: {
          platform: 'seeker-mobile',
          project: nextSession.projectName,
          device: 'Daemon Seeker app',
        },
      }),
    })
    if (!res.ok) return { ok: false, error: `Relay returned ${res.status}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Pair event failed' }
  }
}

function StatusPill({ label, tone = 'green' }: { label: string; tone?: 'green' | 'blue' | 'yellow' | 'red' | 'gray' }) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  )
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

function ApprovalCard({ approval, onApprove, onReject, onReset }: {
  approval: ApprovalRequest
  onApprove: () => void
  onReject: () => void
  onReset: () => void
}) {
  return (
    <View style={[styles.card, approval.status !== 'pending' && styles.cardMuted]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderMain}>
          <Text style={styles.cardTitle}>{approval.title}</Text>
          <Text style={styles.cardCopy}>{approval.description}</Text>
        </View>
        <View style={[styles.riskBadge, { borderColor: riskColor(approval.risk), backgroundColor: `${riskColor(approval.risk)}18` }]}>
          <Text style={[styles.riskText, { color: riskColor(approval.risk) }]}>{approval.risk}</Text>
        </View>
      </View>

      {approval.command ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{approval.command}</Text>
        </View>
      ) : null}

      {approval.diffSummary ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{approval.diffSummary}</Text>
        </View>
      ) : null}

      <View style={styles.rowButtons}>
        {approval.status === 'pending' ? (
          <>
            <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onReject}>
              <Text style={styles.buttonSecondaryText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={onApprove}>
              <Text style={styles.buttonPrimaryText}>Approve</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onReset}>
            <Text style={styles.buttonSecondaryText}>Reset to pending</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [relayInput, setRelayInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [pairingMessage, setPairingMessage] = useState<string | null>(null)
  const { session, deepLink, pairManually, resetPairing } = usePairingSession()
  const relay = useDesktopRelay(session.relayUrl, session.pairingCode)
  const approvals = useApprovalQueue(relay.sendRelayEvent)
  const wallet = useSeekerWallet()
  const notifications = useSeekerNotifications()

  const project = useMemo(() => ({
    ...demoProject,
    ...(relay.snapshot?.project ?? {}),
    pendingApprovals: approvals.pendingCount,
  }), [approvals.pendingCount, relay.snapshot?.project])

  useEffect(() => {
    if (relay.snapshot?.approvals) approvals.loadFromDesktop(relay.snapshot.approvals)
  }, [approvals, relay.snapshot?.approvals])

  useEffect(() => {
    if (session.status !== 'paired') return
    const timer = setInterval(() => {
      void relay.syncRelaySnapshot().then((result) => {
        if (result.ok && result.data?.approvals) approvals.loadFromDesktop(result.data.approvals)
      })
    }, 3000)
    return () => clearInterval(timer)
  }, [approvals, relay, session.status])

  const handlePair = async () => {
    const nextSession = pairManually(codeInput || session.pairingCode, relayInput || session.relayUrl)
    setPairingMessage('Pairing with Daemon desktop...')
    const result = await sendPairEvent(nextSession)
    if (!result.ok) {
      setPairingMessage(result.error ?? 'Could not reach desktop relay')
      return
    }
    setPairingMessage('Paired with Daemon desktop')
    await relay.syncRelaySnapshot()
  }

  const handleSync = async () => {
    const result = await relay.syncRelaySnapshot()
    if (result.ok && result.data?.approvals) approvals.loadFromDesktop(result.data.approvals)
  }

  const handleConnectWallet = async () => {
    const result = await wallet.connectWallet()
    if (result.ok && result.address) {
      await relay.sendRelayEvent({ type: 'wallet.connected', payload: { address: result.address } })
    }
  }

  const handleSignPairingMessage = async () => {
    const result = await wallet.signMessage(`Pair Daemon Seeker session ${session.pairingCode}`)
    if (result.ok) {
      await relay.sendRelayEvent({ type: 'wallet.sign-request', payload: { kind: 'pairing-message', status: 'signed' } })
    }
  }

  const renderHome = () => (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.eyebrow}>Daemon Seeker</Text>
            <Text style={styles.heroTitle}>Command center for Solana builders</Text>
          </View>
          <StatusPill label={session.status === 'paired' ? 'Paired' : 'Ready'} tone={session.status === 'paired' ? 'green' : 'blue'} />
        </View>
        <Text style={styles.heroCopy}>
          Review agent actions, approve deploys, sign wallet requests, and monitor your build from Seeker.
        </Text>
        <View style={styles.scoreWrap}>
          <Text style={styles.score}>{project.readiness}</Text>
          <View style={styles.scoreSide}>
            <Text style={styles.scoreLabel}>Launch Score</Text>
            <Text style={styles.scoreCopy}>{project.name}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard label="Approvals" value={`${approvals.pendingCount} pending`} />
        <MetricCard label="Validator" value={project.validatorOnline ? 'Online' : 'Offline'} />
        <MetricCard label="Integrations" value={`${project.enabledIntegrations} active`} />
        <MetricCard label="Wallet" value={project.walletBalance ?? shortAddress(wallet.wallet.address)} />
      </View>

      <View style={styles.card}>
        <SectionTitle eyebrow="Next action" title="Review before Daemon executes" />
        <Text style={styles.cardCopy}>
          Keep the desktop agent fast while Seeker becomes the final approval and signing device.
        </Text>
        <TouchableOpacity style={[styles.button, styles.buttonPrimary, styles.fullButton]} onPress={() => setActiveTab('approvals')}>
          <Text style={styles.buttonPrimaryText}>Open approval queue</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderApprovals = () => (
    <View>
      <View style={styles.screenHeader}>
        <SectionTitle eyebrow="Approvals" title="Agent actions waiting on Seeker" />
        <TouchableOpacity style={[styles.smallButton, styles.buttonSecondary]} onPress={() => void notifications.notifyApprovalWaiting(approvals.pendingCount)}>
          <Text style={styles.buttonSecondaryText}>Test alert</Text>
        </TouchableOpacity>
      </View>
      {approvals.lastActionError ? <Text style={styles.errorText}>{approvals.lastActionError}</Text> : null}
      {approvals.approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          onApprove={() => { void approvals.approve(approval.id) }}
          onReject={() => { void approvals.reject(approval.id) }}
          onReset={() => { void approvals.reset(approval.id) }}
        />
      ))}
    </View>
  )

  const renderWallet = () => (
    <View>
      <SectionTitle eyebrow="Wallet" title="Seeker signing layer" />
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderMain}>
            <Text style={styles.cardTitle}>{shortAddress(wallet.wallet.address)}</Text>
            <Text style={styles.cardCopy}>Use Mobile Wallet Adapter for message and transaction approvals.</Text>
          </View>
          <StatusPill label={wallet.wallet.cluster} tone="green" />
        </View>
        {wallet.wallet.error ? <Text style={styles.errorText}>{wallet.wallet.error}</Text> : null}
        <View style={styles.rowButtons}>
          <TouchableOpacity
            style={[styles.button, wallet.wallet.cluster === 'devnet' ? styles.buttonPrimary : styles.buttonSecondary]}
            onPress={() => wallet.setCluster('devnet')}
          >
            <Text style={wallet.wallet.cluster === 'devnet' ? styles.buttonPrimaryText : styles.buttonSecondaryText}>Devnet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, wallet.wallet.cluster === 'mainnet-beta' ? styles.buttonPrimary : styles.buttonSecondary]}
            onPress={() => wallet.setCluster('mainnet-beta')}
          >
            <Text style={wallet.wallet.cluster === 'mainnet-beta' ? styles.buttonPrimaryText : styles.buttonSecondaryText}>Mainnet</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.button, styles.buttonPrimary, styles.fullButton]} onPress={handleConnectWallet}>
          <Text style={styles.buttonPrimaryText}>{wallet.wallet.connecting ? 'Connecting...' : 'Connect Seeker wallet'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={handleSignPairingMessage}>
          <Text style={styles.buttonSecondaryText}>Sign pairing message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={() => { void wallet.disconnectWallet() }}>
          <Text style={styles.buttonSecondaryText}>Disconnect wallet</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  const renderPair = () => (
    <View>
      <SectionTitle eyebrow="Pairing" title="Connect Seeker to Daemon desktop" />
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Pairing code</Text>
        <TextInput
          value={codeInput}
          onChangeText={setCodeInput}
          placeholder={session.pairingCode}
          placeholderTextColor="#68746f"
          autoCapitalize="characters"
          style={styles.input}
        />
        <Text style={styles.inputLabel}>Desktop relay URL</Text>
        <TextInput
          value={relayInput}
          onChangeText={setRelayInput}
          placeholder="http://192.168.1.10:7778"
          placeholderTextColor="#68746f"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {pairingMessage ? <Text style={pairingMessage.includes('Could') ? styles.errorText : styles.successText}>{pairingMessage}</Text> : null}
        <View style={styles.rowButtons}>
          <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handlePair}>
            <Text style={styles.buttonPrimaryText}>Pair</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={resetPairing}>
            <Text style={styles.buttonSecondaryText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current session</Text>
        <Text style={styles.codeText}>Code: {session.pairingCode}</Text>
        <Text style={styles.codeText}>Relay: {session.relayUrl || 'Not set'}</Text>
        <Text style={styles.codeText}>Link: {deepLink}</Text>
        {relay.lastError ? <Text style={styles.errorText}>{relay.lastError}</Text> : null}
        <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={handleSync}>
          <Text style={styles.buttonSecondaryText}>Sync from desktop relay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={() => { void notifications.requestNotifications() }}>
          <Text style={styles.buttonSecondaryText}>{notifications.enabled ? 'Notifications enabled' : 'Enable notifications'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' && renderHome()}
          {activeTab === 'approvals' && renderApprovals()}
          {activeTab === 'wallet' && renderWallet()}
          {activeTab === 'pair' && renderPair()}
        </ScrollView>

        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, activeTab === tab.id && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050706',
  },
  appShell: {
    flex: 1,
    backgroundColor: '#050706',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 112,
  },
  heroCard: {
    borderWidth: 1,
    borderColor: 'rgba(20,241,149,0.22)',
    backgroundColor: '#07110d',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: {
    color: '#14f195',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    color: '#f4fff9',
    fontSize: 38,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -1.6,
    maxWidth: 280,
  },
  heroCopy: {
    color: '#aab8b1',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 26,
  },
  score: {
    color: '#14f195',
    fontSize: 88,
    lineHeight: 88,
    fontWeight: '900',
    letterSpacing: -6,
    marginRight: 16,
  },
  scoreSide: {
    flex: 1,
    paddingBottom: 12,
  },
  scoreLabel: {
    color: '#f4fff9',
    fontSize: 18,
    fontWeight: '800',
  },
  scoreCopy: {
    color: '#77847e',
    fontSize: 13,
    marginTop: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
    marginBottom: 10,
  },
  metricCard: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  metricLabel: {
    color: '#68746f',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  metricValue: {
    color: '#f4fff9',
    fontSize: 16,
    fontWeight: '800',
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0a0f0d',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  cardMuted: {
    opacity: 0.72,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderMain: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    color: '#f4fff9',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  cardCopy: {
    color: '#9aa7a1',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  sectionTitleWrap: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f4fff9',
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pill_green: { borderColor: 'rgba(20,241,149,0.28)', backgroundColor: 'rgba(20,241,149,0.08)' },
  pill_blue: { borderColor: 'rgba(96,165,250,0.28)', backgroundColor: 'rgba(96,165,250,0.08)' },
  pill_yellow: { borderColor: 'rgba(240,180,41,0.28)', backgroundColor: 'rgba(240,180,41,0.08)' },
  pill_red: { borderColor: 'rgba(255,112,102,0.28)', backgroundColor: 'rgba(255,112,102,0.08)' },
  pill_gray: { borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  pillText_green: { color: '#14f195' },
  pillText_blue: { color: '#60a5fa' },
  pillText_yellow: { color: '#f0b429' },
  pillText_red: { color: '#ff7066' },
  pillText_gray: { color: '#aab8b1' },
  riskBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  riskText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  codeBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    backgroundColor: '#050706',
    padding: 12,
    marginTop: 10,
  },
  codeText: {
    color: '#b9c7c0',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  rowButtons: {
    flexDirection: 'row',
    marginTop: 14,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 12,
  },
  smallButton: {
    minHeight: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fullButton: {
    marginTop: 12,
    marginRight: 0,
  },
  buttonPrimary: {
    backgroundColor: '#14f195',
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  buttonPrimaryText: {
    color: '#03100a',
    fontSize: 14,
    fontWeight: '900',
  },
  buttonSecondaryText: {
    color: '#f4fff9',
    fontSize: 14,
    fontWeight: '800',
  },
  inputLabel: {
    color: '#68746f',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 7,
    marginTop: 10,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#050706',
    borderRadius: 14,
    color: '#f4fff9',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  errorText: {
    color: '#ff7066',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  successText: {
    color: '#14f195',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    minHeight: 68,
    borderRadius: 24,
    backgroundColor: 'rgba(5,7,6,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(20,241,149,0.12)',
  },
  tabText: {
    color: '#68746f',
    fontSize: 12,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#14f195',
  },
})
