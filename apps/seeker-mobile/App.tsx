import { useEffect, useMemo, useState } from 'react'
import {
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { demoProject } from './src/data/demo'
import { useApprovalQueue } from './src/hooks/useApprovalQueue'
import { useDesktopRelay } from './src/hooks/useDesktopRelay'
import { usePairingSession } from './src/hooks/usePairingSession'
import { useSeekerNotifications } from './src/hooks/useSeekerNotifications'
import { useSeekerWallet } from './src/hooks/useSeekerWallet'
import type { ApprovalRequest, ApprovalRisk, PairingSession } from './src/types'

const daemonIcon = require('./assets/daemon-icon-48.png')

type TabId = 'home' | 'approvals' | 'wallet' | 'pair'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'pair', label: 'Pair' },
]

const ANDROID_STATUS_PADDING = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 0

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

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'green' && styles.metricValueGreen]}>{value}</Text>
    </View>
  )
}

function HaloBackground({ tint = 'rgba(20,241,149,0.18)' }: { tint?: string }) {
  return (
    <LinearGradient
      colors={[tint, 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
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
      <View style={styles.approvalTopRow}>
        <View style={[styles.riskBadge, { borderColor: riskColor(approval.risk), backgroundColor: `${riskColor(approval.risk)}14` }]}>
          <Text style={[styles.riskText, { color: riskColor(approval.risk) }]}>{approval.risk} risk</Text>
        </View>
        {approval.status !== 'pending' ? (
          <Text style={styles.approvalStatusTag}>{approval.status === 'approved' ? '✓ approved' : '✕ rejected'}</Text>
        ) : null}
      </View>
      <Text style={styles.cardTitle}>{approval.title}</Text>
      <Text style={styles.cardCopy}>{approval.description}</Text>

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
          <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={onReset}>
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
        <HaloBackground />
        <View style={styles.heroTopRow}>
          <Text style={styles.eyebrow}>Daemon for Seeker</Text>
          <StatusPill label={session.status === 'paired' ? 'Paired' : 'Ready'} tone={session.status === 'paired' ? 'green' : 'blue'} />
        </View>
        <Text style={styles.heroTitle}>Mobile command center for Solana builders</Text>
        <Text style={styles.heroCopy}>
          Review agent actions, approve deploys, and sign wallet requests directly from Seeker.
        </Text>
        <View style={styles.scoreRow}>
          <Text style={styles.score}>{project.readiness}</Text>
          <View style={styles.scoreSide}>
            <Text style={styles.scoreLabel}>Launch Score</Text>
            <Text style={styles.scoreCopy}>{project.name}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard label="Approvals" value={`${approvals.pendingCount} pending`} tone={approvals.pendingCount > 0 ? 'green' : 'default'} />
        <MetricCard label="Validator" value={project.validatorOnline ? 'Online' : 'Offline'} />
        <MetricCard label="Integrations" value={`${project.enabledIntegrations} active`} />
        <MetricCard label="Wallet" value={wallet.wallet.address ? shortAddress(wallet.wallet.address) : project.walletBalance ?? 'Not connected'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>Next action</Text>
        <Text style={styles.cardTitle}>Review before Daemon executes</Text>
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
        <View style={styles.screenHeaderTitle}>
          <SectionTitle eyebrow="Approvals" title="Agent actions waiting on Seeker" />
        </View>
        <TouchableOpacity style={[styles.smallButton]} onPress={() => void notifications.notifyApprovalWaiting(approvals.pendingCount)}>
          <Text style={styles.smallButtonText}>Test alert</Text>
        </TouchableOpacity>
      </View>
      {approvals.lastActionError ? <Text style={styles.errorText}>{approvals.lastActionError}</Text> : null}
      {approvals.approvals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No approvals yet. Pair Seeker to your Daemon desktop to start receiving agent actions.</Text>
        </View>
      ) : (
        approvals.approvals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            onApprove={() => { void approvals.approve(approval.id) }}
            onReject={() => { void approvals.reject(approval.id) }}
            onReset={() => { void approvals.reset(approval.id) }}
          />
        ))
      )}
    </View>
  )

  const renderWallet = () => {
    const isConnected = Boolean(wallet.wallet.address)
    return (
      <View>
        <SectionTitle eyebrow="Wallet" title="Seeker signing layer" />
        <View style={styles.card}>
          <View style={styles.walletGlyphWrap}>
            <View style={[styles.walletGlyph, isConnected && styles.walletGlyphActive]}>
              <Text style={[styles.walletGlyphText, isConnected && styles.walletGlyphTextActive]}>{isConnected ? '◆' : '◇'}</Text>
            </View>
            <Text style={styles.walletAddress}>{shortAddress(wallet.wallet.address)}</Text>
            <Text style={styles.walletHint}>{isConnected
              ? 'Mobile Wallet Adapter session active. Sign messages and transactions from Daemon.'
              : 'Use Mobile Wallet Adapter to authorize a wallet for Daemon agent actions.'}
            </Text>
            <View style={styles.walletClusterRow}>
              <TouchableOpacity
                style={[styles.clusterChip, wallet.wallet.cluster === 'devnet' && styles.clusterChipActive]}
                onPress={() => wallet.setCluster('devnet')}
              >
                <Text style={[styles.clusterChipText, wallet.wallet.cluster === 'devnet' && styles.clusterChipTextActive]}>Devnet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.clusterChip, wallet.wallet.cluster === 'mainnet-beta' && styles.clusterChipActive]}
                onPress={() => wallet.setCluster('mainnet-beta')}
              >
                <Text style={[styles.clusterChipText, wallet.wallet.cluster === 'mainnet-beta' && styles.clusterChipTextActive]}>Mainnet</Text>
              </TouchableOpacity>
            </View>
          </View>
          {wallet.wallet.error ? <Text style={styles.errorText}>{wallet.wallet.error}</Text> : null}
          <TouchableOpacity style={[styles.button, styles.buttonPrimary, styles.fullButton]} onPress={handleConnectWallet}>
            <Text style={styles.buttonPrimaryText}>{wallet.wallet.connecting ? 'Connecting...' : isConnected ? 'Reconnect wallet' : 'Connect Seeker wallet'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={handleSignPairingMessage}>
            <Text style={styles.buttonSecondaryText}>Sign pairing message</Text>
          </TouchableOpacity>
          {isConnected ? (
            <TouchableOpacity style={[styles.button, styles.buttonGhost, styles.fullButton]} onPress={() => { void wallet.disconnectWallet() }}>
              <Text style={styles.buttonGhostText}>Disconnect wallet</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    )
  }

  const renderPair = () => (
    <View>
      <SectionTitle eyebrow="Pairing" title="Connect Seeker to Daemon desktop" />
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Pairing code</Text>
        <TextInput
          value={codeInput}
          onChangeText={setCodeInput}
          placeholder={session.pairingCode}
          placeholderTextColor="#5d6862"
          autoCapitalize="characters"
          style={styles.input}
        />
        <Text style={styles.inputLabel}>Desktop relay URL</Text>
        <TextInput
          value={relayInput}
          onChangeText={setRelayInput}
          placeholder="http://192.168.1.10:7778"
          placeholderTextColor="#5d6862"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {pairingMessage ? <Text style={pairingMessage.includes('Could') ? styles.errorText : styles.successText}>{pairingMessage}</Text> : null}
        <View style={styles.rowButtons}>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={resetPairing}>
            <Text style={styles.buttonSecondaryText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handlePair}>
            <Text style={styles.buttonPrimaryText}>Pair</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardEyebrow}>Current session</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Code</Text>
          <Text style={styles.detailValueMono}>{session.pairingCode}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Relay</Text>
          <Text style={styles.detailValueMono}>{session.relayUrl || 'Not set'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Deep link</Text>
          <Text style={styles.detailValueMono}>{deepLink}</Text>
        </View>
        {relay.lastError ? <Text style={styles.errorText}>{relay.lastError}</Text> : null}
        <TouchableOpacity style={[styles.button, styles.buttonSecondary, styles.fullButton]} onPress={handleSync}>
          <Text style={styles.buttonSecondaryText}>Sync from desktop relay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonGhost, styles.fullButton]} onPress={() => { void notifications.requestNotifications() }}>
          <Text style={styles.buttonGhostText}>{notifications.enabled ? 'Notifications enabled' : 'Enable notifications'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View style={styles.topBarBrand}>
            <Image source={daemonIcon} style={styles.topBarLogo} />
            <View>
              <Text style={styles.topBarTitle}>DAEMON</Text>
              <Text style={styles.topBarSub}>Seeker</Text>
            </View>
          </View>
          <View style={styles.topBarStatus}>
            <View style={[styles.statusDot, session.status === 'paired' ? styles.statusDotLive : styles.statusDotIdle]} />
            <Text style={styles.topBarStatusText}>{session.status === 'paired' ? 'Paired' : 'Standby'}</Text>
          </View>
        </View>

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

const COLORS = {
  bg: '#050706',
  surface: '#0a0f0d',
  surfaceAlt: '#070b09',
  border: 'rgba(255,255,255,0.07)',
  borderGreen: 'rgba(62,207,142,0.18)',
  borderGreenSoft: 'rgba(62,207,142,0.10)',
  t1: '#f4fff9',
  t2: '#c4d2cb',
  t3: '#8e9c95',
  t4: '#5d6862',
  green: '#14f195',
  greenDeep: '#3ecf8e',
  blue: '#60a5fa',
  amber: '#f0b429',
  red: '#ff7066',
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: ANDROID_STATUS_PADDING,
  },
  appShell: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  topBarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarLogo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  topBarTitle: {
    color: COLORS.t1,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  topBarSub: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  topBarStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  statusDotLive: { backgroundColor: COLORS.green },
  statusDotIdle: { backgroundColor: COLORS.blue, opacity: 0.7 },
  topBarStatusText: {
    color: COLORS.t2,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 120,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderGreen,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  eyebrow: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: COLORS.t1,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroCopy: {
    color: COLORS.t3,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 22,
  },
  score: {
    color: COLORS.green,
    fontSize: 76,
    lineHeight: 76,
    fontWeight: '900',
    letterSpacing: -5,
    marginRight: 14,
  },
  scoreSide: {
    flex: 1,
    paddingBottom: 10,
  },
  scoreLabel: {
    color: COLORS.t1,
    fontSize: 15,
    fontWeight: '800',
  },
  scoreCopy: {
    color: COLORS.t4,
    fontSize: 12,
    marginTop: 3,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 4,
  },
  metricCard: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  metricLabel: {
    color: COLORS.t4,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    color: COLORS.t1,
    fontSize: 15,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  metricValueGreen: {
    color: COLORS.green,
    borderColor: COLORS.borderGreenSoft,
    backgroundColor: 'rgba(62,207,142,0.05)',
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardMuted: {
    opacity: 0.7,
  },
  cardEyebrow: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardTitle: {
    color: COLORS.t1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  cardCopy: {
    color: COLORS.t3,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 6,
  },
  sectionTitleWrap: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.t1,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 4,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  screenHeaderTitle: {
    flex: 1,
    minWidth: 0,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pill_green: { borderColor: 'rgba(20,241,149,0.25)', backgroundColor: 'rgba(20,241,149,0.07)' },
  pill_blue: { borderColor: 'rgba(96,165,250,0.25)', backgroundColor: 'rgba(96,165,250,0.07)' },
  pill_yellow: { borderColor: 'rgba(240,180,41,0.25)', backgroundColor: 'rgba(240,180,41,0.07)' },
  pill_red: { borderColor: 'rgba(255,112,102,0.25)', backgroundColor: 'rgba(255,112,102,0.07)' },
  pill_gray: { borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.035)' },
  pillText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  pillText_green: { color: COLORS.green },
  pillText_blue: { color: COLORS.blue },
  pillText_yellow: { color: COLORS.amber },
  pillText_red: { color: COLORS.red },
  pillText_gray: { color: COLORS.t3 },
  approvalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  approvalStatusTag: {
    color: COLORS.t4,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  riskBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  riskText: {
    fontSize: 9.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  codeBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: '#000',
    padding: 11,
    marginTop: 10,
  },
  codeText: {
    color: COLORS.t2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  rowButtons: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  smallButton: {
    minHeight: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  smallButtonText: {
    color: COLORS.t2,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  fullButton: {
    marginTop: 10,
  },
  buttonPrimary: {
    backgroundColor: COLORS.green,
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  buttonPrimaryText: {
    color: '#03100a',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  buttonSecondaryText: {
    color: COLORS.t1,
    fontSize: 13.5,
    fontWeight: '700',
  },
  buttonGhostText: {
    color: COLORS.t3,
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    color: COLORS.t4,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#000',
    borderRadius: 12,
    color: COLORS.t1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  errorText: {
    color: COLORS.red,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 10,
  },
  successText: {
    color: COLORS.green,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 10,
  },
  emptyState: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 22,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  emptyStateText: {
    color: COLORS.t3,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  walletGlyphWrap: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  walletGlyph: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  walletGlyphActive: {
    borderColor: COLORS.borderGreen,
    backgroundColor: 'rgba(20,241,149,0.06)',
  },
  walletGlyphText: {
    color: COLORS.t3,
    fontSize: 28,
    lineHeight: 32,
  },
  walletGlyphTextActive: {
    color: COLORS.green,
  },
  walletAddress: {
    color: COLORS.t1,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  walletHint: {
    color: COLORS.t3,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  walletClusterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  clusterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  clusterChipActive: {
    borderColor: COLORS.borderGreen,
    backgroundColor: 'rgba(20,241,149,0.08)',
  },
  clusterChipText: {
    color: COLORS.t3,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  clusterChipTextActive: {
    color: COLORS.green,
  },
  detailRow: {
    marginTop: 12,
  },
  detailLabel: {
    color: COLORS.t4,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValueMono: {
    color: COLORS.t2,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(7,11,9,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(20,241,149,0.10)',
    borderWidth: 1,
    borderColor: COLORS.borderGreenSoft,
  },
  tabText: {
    color: COLORS.t4,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tabTextActive: {
    color: COLORS.green,
  },
})
