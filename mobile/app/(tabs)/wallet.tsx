import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

const HOLDINGS = [
  { symbol: 'SOL', amount: 24.8912, usd: 4231.18, change: 3.2 },
  { symbol: 'USDC', amount: 1250.0, usd: 1250.0, change: 0.0 },
  { symbol: 'JUP', amount: 4800, usd: 312.48, change: -2.1 },
  { symbol: 'BONK', amount: 15200000, usd: 198.72, change: 12.4 },
  { symbol: 'RAY', amount: 82.5, usd: 156.33, change: -0.8 },
];

const RECENT_TXS = [
  { id: '1', type: 'Received', amount: '+2.5 SOL', from: '7xKX...AsU', time: '2h ago', color: colors.green },
  { id: '2', type: 'Sent', amount: '-50 USDC', from: 'Dex...4kP', time: '5h ago', color: colors.red },
  { id: '3', type: 'Swap', amount: 'SOL → JUP', from: 'Jupiter', time: '1d ago', color: colors.blue },
];

function fmt(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function changeColor(v: number) {
  return v > 0 ? colors.green : v < 0 ? colors.red : colors.t4;
}

export default function WalletScreen() {
  const total = HOLDINGS.reduce((s, h) => s + h.usd, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
        <StatusDot color="green" size={6} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {/* Portfolio card */}
        <View style={styles.portfolioCard}>
          <Text style={styles.portfolioLabel}>Total Balance</Text>
          <Text style={styles.portfolioValue}>
            ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.portfolioSol}>{HOLDINGS[0].amount.toFixed(4)} SOL</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {['Send', 'Receive', 'Swap'].map((label) => (
            <Pressable key={label} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
              <Text style={styles.actionIcon}>
                {label === 'Send' ? '\u2191' : label === 'Receive' ? '\u2193' : '\u21C4'}
              </Text>
              <Text style={styles.actionLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Holdings */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Holdings</Text>
            <Text style={styles.sectionCount}>{HOLDINGS.length}</Text>
          </View>

          {HOLDINGS.map((t) => (
            <View key={t.symbol} style={styles.tokenRow}>
              <View style={styles.tokenLeft}>
                <View style={styles.tokenIcon}>
                  <Text style={styles.tokenIconChar}>{t.symbol[0]}</Text>
                </View>
                <View>
                  <Text style={styles.tokenSymbol}>{t.symbol}</Text>
                  <Text style={styles.tokenAmt}>{fmt(t.amount)}</Text>
                </View>
              </View>
              <View style={styles.tokenRight}>
                <Text style={styles.tokenUsd}>
                  ${t.usd >= 1000 ? t.usd.toLocaleString('en-US', { maximumFractionDigits: 0 }) : t.usd.toFixed(2)}
                </Text>
                <Text style={[styles.tokenChange, { color: changeColor(t.change) }]}>
                  {t.change > 0 ? '+' : ''}{t.change.toFixed(1)}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Recent */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent</Text>
          </View>

          {RECENT_TXS.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <View style={[styles.txDot, { backgroundColor: tx.color + '20' }]}>
                  <View style={[styles.txDotInner, { backgroundColor: tx.color }]} />
                </View>
                <View>
                  <Text style={styles.txType}>{tx.type}</Text>
                  <Text style={styles.txFrom}>{tx.from}</Text>
                </View>
              </View>
              <View style={styles.txRight}>
                <Text style={[styles.txAmount, { color: tx.color }]}>{tx.amount}</Text>
                <Text style={styles.txTime}>{tx.time}</Text>
              </View>
            </View>
          ))}
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
  scrollInner: { paddingBottom: spacing.xl },

  // Portfolio
  portfolioCard: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  portfolioLabel: { color: colors.t3, fontSize: fontSize.xs, marginBottom: 4 },
  portfolioValue: { color: colors.t1, fontSize: 32, fontWeight: '700', fontFamily: fonts.code },
  portfolioSol: { color: colors.t4, fontSize: fontSize.xs, fontFamily: fonts.code, marginTop: 4 },

  // Actions
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.s2,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  actionBtnPressed: { backgroundColor: colors.s3 },
  actionIcon: { color: colors.t1, fontSize: fontSize.lg },
  actionLabel: { color: colors.t2, fontSize: fontSize.xxs, fontFamily: fonts.code },

  // Section
  section: { marginTop: 0 },
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

  // Token rows
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  tokenLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tokenIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.s3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconChar: { color: colors.t2, fontSize: fontSize.xs, fontWeight: '700', fontFamily: fonts.code },
  tokenSymbol: { color: colors.t1, fontSize: fontSize.sm, fontWeight: '500' },
  tokenAmt: { color: colors.t4, fontSize: fontSize.xxs, fontFamily: fonts.code, marginTop: 1 },
  tokenRight: { alignItems: 'flex-end' },
  tokenUsd: { color: colors.t1, fontSize: fontSize.sm, fontFamily: fonts.code },
  tokenChange: { fontSize: fontSize.xxs, fontFamily: fonts.code, marginTop: 1 },

  // Transactions
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 52,
  },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  txDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  txDotInner: { width: 6, height: 6, borderRadius: 3 },
  txType: { color: colors.t1, fontSize: fontSize.sm },
  txFrom: { color: colors.t4, fontSize: fontSize.xxs, fontFamily: fonts.code, marginTop: 1 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: fontSize.sm, fontFamily: fonts.code, fontWeight: '500' },
  txTime: { color: colors.t4, fontSize: fontSize.xxs, marginTop: 1 },
});
