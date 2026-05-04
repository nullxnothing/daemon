import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

interface Project {
  id: string;
  name: string;
  branch: string;
  status: 'clean' | 'dirty';
  lastCommit: string;
  sessions: number;
}

const PROJECTS: Project[] = [
  { id: '1', name: 'DAEMON', branch: 'hackathon/frontier', status: 'dirty', lastCommit: 'feat: mobile companion relay', sessions: 2 },
  { id: '2', name: 'jefflink', branch: 'main', status: 'clean', lastCommit: 'fix: auth redirect loop', sessions: 1 },
  { id: '3', name: 'trading-bot', branch: 'feat/risk-limits', status: 'dirty', lastCommit: 'refactor: position sizing', sessions: 0 },
];

interface QuickAction {
  label: string;
  accent: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Typecheck', accent: colors.blue },
  { label: 'Test', accent: colors.green },
  { label: 'Health', accent: colors.amber },
];

export default function ProjectsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <Text style={styles.count}>{PROJECTS.length}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {PROJECTS.map((p) => (
          <View key={p.id} style={styles.card}>
            {/* Project header */}
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <Text style={styles.projectName}>{p.name}</Text>
                {p.sessions > 0 && (
                  <View style={styles.sessionBadge}>
                    <StatusDot color="green" size={4} />
                    <Text style={styles.sessionCount}>{p.sessions}</Text>
                  </View>
                )}
              </View>
              <View style={[styles.statusPill, { backgroundColor: p.status === 'clean' ? colors.greenGlow : colors.amberGlow }]}>
                <Text style={[styles.statusText, { color: p.status === 'clean' ? colors.green : colors.amber }]}>
                  {p.status}
                </Text>
              </View>
            </View>

            {/* Branch + commit */}
            <View style={styles.cardMeta}>
              <Text style={styles.branchText}>{p.branch}</Text>
            </View>
            <Text style={styles.commitText} numberOfLines={1}>{p.lastCommit}</Text>

            {/* Quick actions */}
            <View style={styles.quickRow}>
              {QUICK_ACTIONS.map((a) => (
                <Pressable
                  key={a.label}
                  style={({ pressed }) => [styles.quickBtn, pressed && { backgroundColor: colors.s3 }]}
                >
                  <Text style={[styles.quickLabel, { color: a.accent }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
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
  count: { color: colors.t4, fontSize: fontSize.sm, fontFamily: fonts.code },

  scroll: { flex: 1 },
  scrollInner: { paddingBottom: spacing.xl },

  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  projectName: { color: colors.t1, fontSize: fontSize.md, fontWeight: '600' },
  sessionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sessionCount: { color: colors.green, fontSize: fontSize.xxs, fontFamily: fonts.code },
  statusPill: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: fontSize.xxs, fontWeight: '600', fontFamily: fonts.code },

  cardMeta: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  branchText: { color: colors.blue, fontSize: fontSize.xs, fontFamily: fonts.code },
  commitText: { color: colors.t3, fontSize: fontSize.xs, marginTop: 4 },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickLabel: { fontSize: fontSize.xxs, fontWeight: '600', fontFamily: fonts.code },
});
