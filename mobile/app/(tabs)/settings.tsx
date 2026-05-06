import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

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
];

function statusColor(s: string) {
  return s === 'active' ? colors.green : s === 'idle' ? colors.amber : colors.t4;
}

function SettingRow({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLeft}>
        {dot && <StatusDot color={dot} size={5} />}
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {/* Connection */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Connection</Text>
        </View>
        <View style={styles.group}>
          <SettingRow label="Desktop Sync" value="Disconnected" dot={colors.red} />
          <View style={styles.divider} />
          <SettingRow label="WebSocket" value="Connected" dot={colors.green} />
          <View style={styles.divider} />
          <SettingRow label="RPC Endpoint" value="Helius" />
        </View>

        {/* Sessions */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Sessions</Text>
          <Text style={styles.sectionCount}>{SESSIONS.length}</Text>
        </View>

        {SESSIONS.map((session) => (
          <Pressable
            key={session.id}
            style={({ pressed }) => [styles.sessionRow, pressed && { backgroundColor: colors.s2 }]}
          >
            <View style={styles.sessionLeft}>
              <StatusDot color={statusColor(session.status)} size={5} />
              <View>
                <Text style={styles.sessionName}>{session.project}</Text>
                <Text style={styles.sessionMeta}>
                  {session.model} / {session.tokens} / {session.cost}
                </Text>
              </View>
            </View>
            <Text style={[styles.sessionStatus, { color: statusColor(session.status) }]}>
              {session.status}
            </Text>
          </Pressable>
        ))}

        {/* Security */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Security</Text>
        </View>
        <View style={styles.group}>
          <SettingRow label="Biometric Lock" value="Enabled" dot={colors.green} />
          <View style={styles.divider} />
          <SettingRow label="Auto-Lock" value="5 min" />
          <View style={styles.divider} />
          <SettingRow label="Agent Model" value="opus-4" />
        </View>

        {/* About */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>About</Text>
        </View>
        <View style={styles.group}>
          <SettingRow label="Version" value="0.2.0" />
          <View style={styles.divider} />
          <SettingRow label="Build" value="2026.04.14" />
          <View style={styles.divider} />
          <SettingRow label="Platform" value="Electron 33" />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>DAEMON</Text>
          <Text style={styles.footerSub}>Verifiable AI development workbench</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.t1, fontSize: fontSize.lg, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollInner: { paddingBottom: spacing.xxl },

  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.s1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: { color: colors.t3, fontSize: fontSize.xxs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  sectionCount: { color: colors.t4, fontSize: fontSize.xxs, fontFamily: fonts.code },

  group: { borderBottomWidth: 1, borderBottomColor: colors.border },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settingLabel: { color: colors.t2, fontSize: fontSize.sm },
  settingValue: { color: colors.t3, fontSize: fontSize.xs, fontFamily: fonts.code },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },

  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 52,
  },
  sessionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sessionName: { color: colors.t1, fontSize: fontSize.sm, fontWeight: '500' },
  sessionMeta: { color: colors.t4, fontSize: fontSize.xxs, fontFamily: fonts.code, marginTop: 2 },
  sessionStatus: { fontSize: fontSize.xxs, fontFamily: fonts.code, fontWeight: '600' },

  footer: { alignItems: 'center', paddingVertical: spacing.xxl, gap: 4 },
  footerBrand: { color: colors.t4, fontSize: fontSize.xs, fontWeight: '700', fontFamily: fonts.code, letterSpacing: 3 },
  footerSub: { color: colors.t4, fontSize: fontSize.xxs, opacity: 0.5 },
});
