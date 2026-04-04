import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

// Hackathon countdown target: May 1 2026
const HACKATHON_END = new Date('2026-05-01T00:00:00Z').getTime();

interface Session {
  id: string;
  model: string;
  modelColor: string;
  status: 'active' | 'idle' | 'stopped';
  project: string;
  started: string;
  tokens: string;
  cost: string;
}

const SESSIONS: Session[] = [
  { id: '1', model: 'OPUS', modelColor: colors.purple, status: 'active', project: 'DAEMON', started: '2h ago', tokens: '847K', cost: '$0.42' },
  { id: '2', model: 'SONNET', modelColor: colors.blue, status: 'active', project: 'DAEMON/mobile', started: '14m ago', tokens: '124K', cost: '$0.08' },
  { id: '3', model: 'SONNET', modelColor: colors.blue, status: 'idle', project: 'jefflink', started: '6h ago', tokens: '2.1M', cost: '$1.24' },
  { id: '4', model: 'OPUS', modelColor: colors.purple, status: 'stopped', project: 'trading-bot', started: '1d ago', tokens: '4.8M', cost: '$3.21' },
  { id: '5', model: 'SONNET', modelColor: colors.blue, status: 'stopped', project: 'DAEMON', started: '2d ago', tokens: '1.2M', cost: '$0.72' },
];

function ModelBadge({ model, color }: { model: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.badgeText, { color }]}>{model}</Text>
    </View>
  );
}

function statusDotColor(status: string): string {
  if (status === 'active') return colors.green;
  if (status === 'idle') return colors.amber;
  return colors.t4;
}

function useCountdown(target: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h`;
}

function SettingsRow({ label, value, dotColor }: { label: string; value?: string; dotColor?: string }) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.rowLeft}>
        {dotColor && <StatusDot color={dotColor} size={5} />}
        <Text style={[styles.rowLabel, dotColor ? { marginLeft: spacing.sm } : undefined]}>{label}</Text>
      </View>
      {value && <Text style={styles.rowValue}>{value}</Text>}
    </View>
  );
}

export default function MoreScreen() {
  const countdown = useCountdown(HACKATHON_END);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.brandText}>DAEMON</Text>
          <View style={styles.tabPill}>
            <Text style={styles.tabPillText}>Sessions</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hackathon countdown */}
        <View style={styles.hackathonCard}>
          <View style={styles.hackathonTop}>
            <StatusDot color="amber" size={5} />
            <Text style={styles.hackathonLabel}>Colosseum Frontier</Text>
          </View>
          <View style={styles.hackathonCountdown}>
            <Text style={styles.countdownValue}>{countdown}</Text>
            <Text style={styles.countdownLabel}>remaining</Text>
          </View>
          <View style={styles.hackathonMeta}>
            <Text style={styles.hackathonBranch}>hackathon/frontier</Text>
            <Text style={styles.hackathonSep}>|</Text>
            <Text style={styles.hackathonStatus}>Active</Text>
          </View>
        </View>

        {/* Sessions */}
        <View style={styles.sectionBar}>
          <Text style={styles.sectionLabel}>SESSIONS</Text>
          <Text style={styles.sectionCount}>{SESSIONS.length}</Text>
        </View>

        {SESSIONS.map((session) => (
          <Pressable
            key={session.id}
            style={({ pressed }) => [
              styles.sessionCard,
              pressed && styles.sessionCardPressed,
            ]}
          >
            <View style={styles.sessionTop}>
              <View style={styles.sessionTopLeft}>
                <StatusDot color={statusDotColor(session.status)} size={5} />
                <Text style={styles.sessionProject}>{session.project}</Text>
              </View>
              <ModelBadge model={session.model} color={session.modelColor} />
            </View>
            <View style={styles.sessionMeta}>
              <Text style={styles.sessionMetaText}>{session.started}</Text>
              <Text style={styles.sessionSep}>/</Text>
              <Text style={styles.sessionMetaText}>{session.tokens}</Text>
              <Text style={styles.sessionSep}>/</Text>
              <Text style={styles.sessionMetaText}>{session.cost}</Text>
              <Text style={styles.sessionSep}>/</Text>
              <Text style={[styles.sessionMetaText, { color: statusDotColor(session.status) }]}>
                {session.status}
              </Text>
            </View>
          </Pressable>
        ))}

        {/* Settings */}
        <View style={styles.sectionBar}>
          <Text style={styles.sectionLabel}>SETTINGS</Text>
        </View>

        <View style={styles.settingsGroup}>
          <SettingsRow label="Desktop Sync" value="Disconnected" dotColor={colors.red} />
          <View style={styles.settingsDivider} />
          <SettingsRow label="RPC Endpoint" value="Helius" />
          <View style={styles.settingsDivider} />
          <SettingsRow label="WebSocket" value="Connected" dotColor={colors.green} />
          <View style={styles.settingsDivider} />
          <SettingsRow label="Biometric Lock" value="Enabled" dotColor={colors.green} />
          <View style={styles.settingsDivider} />
          <SettingsRow label="Auto-Lock" value="5 min" />
          <View style={styles.settingsDivider} />
          <SettingsRow label="Agent Model" value="opus-4" />
        </View>

        {/* About */}
        <View style={styles.sectionBar}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
        </View>

        <View style={styles.settingsGroup}>
          <SettingsRow label="Version" value="0.2.0" />
          <View style={styles.settingsDivider} />
          <SettingsRow label="Build" value="2026.04.03" />
          <View style={styles.settingsDivider} />
          <SettingsRow label="Platform" value="Electron 33" />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>DAEMON</Text>
          <Text style={styles.footerSub}>AI-native development environment</Text>
        </View>
      </ScrollView>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>hackathon/frontier</Text>
        <Text style={styles.statusSep}>|</Text>
        <Text style={styles.statusText}>Frontier: {countdown}</Text>
        <Text style={styles.statusSep}>|</Text>
        <Text style={styles.statusText}>1 terminal</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.s1,
    height: 44,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandText: {
    color: colors.t1,
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontFamily: fonts.code,
    letterSpacing: 2,
  },
  tabPill: {
    backgroundColor: colors.s3,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tabPillText: {
    color: colors.t2,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: spacing.lg,
  },

  // Hackathon card
  hackathonCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hackathonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hackathonLabel: {
    color: colors.amber,
    fontSize: fontSize.xs,
    fontWeight: '600',
    fontFamily: fonts.code,
    letterSpacing: 0.5,
  },
  hackathonCountdown: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  countdownValue: {
    color: colors.t1,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    fontFamily: fonts.code,
  },
  countdownLabel: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  hackathonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  hackathonBranch: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },
  hackathonSep: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    opacity: 0.4,
  },
  hackathonStatus: {
    color: colors.green,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },

  // Section bar
  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionLabel: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontWeight: '600',
    fontFamily: fonts.code,
    letterSpacing: 1.5,
  },
  sectionCount: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },

  // Session cards
  sessionCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionCardPressed: {
    backgroundColor: colors.hoverOverlay,
  },
  sessionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionProject: {
    color: colors.t1,
    fontSize: fontSize.sm,
    fontFamily: fonts.code,
    fontWeight: '500',
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingLeft: spacing.lg,
    gap: spacing.xs,
  },
  sessionMetaText: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  sessionSep: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    opacity: 0.3,
  },

  // Badge
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: fontSize.xxs,
    fontWeight: '700',
    fontFamily: fonts.code,
    letterSpacing: 1,
  },

  // Settings
  settingsGroup: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: {
    color: colors.t2,
    fontSize: fontSize.sm,
    fontFamily: fonts.code,
  },
  rowValue: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  footerBrand: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontWeight: '700',
    fontFamily: fonts.code,
    letterSpacing: 4,
    opacity: 0.5,
  },
  footerSub: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    marginTop: spacing.xs,
    opacity: 0.3,
  },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.s1,
    height: 32,
    gap: spacing.sm,
  },
  statusText: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },
  statusSep: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    opacity: 0.3,
  },
});
