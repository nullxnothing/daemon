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

const MARKET_TAPE = [
  { symbol: 'BTC', price: '$60,868', change: -0.05 },
  { symbol: 'SOL', price: '$80.23', change: 1.67 },
  { symbol: 'ETH', price: '$2,050', change: -0.28 },
];

function formatAmount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function changeColor(v: number): string {
  if (v > 0) return colors.green;
  if (v < 0) return colors.red;
  return colors.t4;
}

export default function WalletScreen() {
  const totalUsd = HOLDINGS.reduce((s, h) => s + h.usd, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar - Dashboard style */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.brandText}>DAEMON</Text>
          <View style={styles.tabPill}>
            <Text style={styles.tabPillText}>Dashboard</Text>
          </View>
        </View>
        <StatusDot color="green" size={5} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Portfolio value - matches right panel dashboard */}
        <View style={styles.portfolioBlock}>
          <Text style={styles.portfolioLabel}>PORTFOLIO VALUE</Text>
          <View style={styles.portfolioRow}>
            <Text style={styles.portfolioDollar}>$</Text>
            <Text style={styles.portfolioValue}>
              {totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <Text style={styles.portfolioSol}>
            {HOLDINGS[0].amount.toFixed(4)} SOL
          </Text>
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          {['Send', 'Receive', 'Swap'].map((label) => (
            <Pressable
              key={label}
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && styles.actionBtnPressed,
              ]}
            >
              <Text style={styles.actionBtnText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Holdings section header */}
        <View style={styles.sectionBar}>
          <Text style={styles.sectionLabel}>HOLDINGS</Text>
          <Text style={styles.sectionCount}>{HOLDINGS.length}</Text>
        </View>

        {/* Token rows - tight, desktop-like */}
        {HOLDINGS.map((token) => (
          <View key={token.symbol} style={styles.tokenRow}>
            <View style={styles.tokenLeft}>
              <View style={styles.tokenIcon}>
                <Text style={styles.tokenIconChar}>{token.symbol[0]}</Text>
              </View>
              <View>
                <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                <Text style={styles.tokenAmount}>{formatAmount(token.amount)}</Text>
              </View>
            </View>
            <View style={styles.tokenRight}>
              <Text style={styles.tokenUsd}>
                ${token.usd >= 1000
                  ? token.usd.toLocaleString('en-US', { maximumFractionDigits: 0 })
                  : token.usd.toFixed(2)}
              </Text>
              <Text style={[styles.tokenChange, { color: changeColor(token.change) }]}>
                {token.change > 0 ? '+' : ''}{token.change.toFixed(1)}%
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Market tape status bar - matches desktop bottom bar */}
      <View style={styles.statusBar}>
        {MARKET_TAPE.map((item, i) => (
          <View key={item.symbol} style={styles.tapeItem}>
            {i > 0 && <Text style={styles.tapeSep}>|</Text>}
            <Text style={styles.tapeSymbol}>{item.symbol}</Text>
            <Text style={styles.tapePrice}>{item.price}</Text>
            <Text style={[styles.tapeChange, { color: changeColor(item.change) }]}>
              {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}%
            </Text>
          </View>
        ))}
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

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: spacing.lg,
  },

  // Portfolio
  portfolioBlock: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  portfolioLabel: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  portfolioRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.sm,
  },
  portfolioDollar: {
    color: colors.t3,
    fontSize: fontSize.xl,
    fontFamily: fonts.code,
    fontWeight: '300',
  },
  portfolioValue: {
    color: colors.green,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: fonts.code,
  },
  portfolioSol: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    marginTop: spacing.xs,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 1,
    backgroundColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.s2,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionBtnPressed: {
    backgroundColor: colors.s3,
  },
  actionBtnText: {
    color: colors.t2,
    fontSize: fontSize.xs,
    fontWeight: '500',
    fontFamily: fonts.code,
    letterSpacing: 0.5,
  },

  // Section
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

  // Token rows
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tokenIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.s3,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconChar: {
    color: colors.t3,
    fontSize: fontSize.xs,
    fontWeight: '700',
    fontFamily: fonts.code,
  },
  tokenSymbol: {
    color: colors.t1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: fonts.code,
  },
  tokenAmount: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    marginTop: 1,
  },
  tokenRight: {
    alignItems: 'flex-end',
  },
  tokenUsd: {
    color: colors.t1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    fontFamily: fonts.code,
  },
  tokenChange: {
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    marginTop: 1,
  },

  // Status bar (market tape)
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
    gap: spacing.xs,
  },
  tapeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tapeSep: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    opacity: 0.4,
    marginRight: spacing.xs,
  },
  tapeSymbol: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    fontWeight: '600',
  },
  tapePrice: {
    color: colors.t2,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },
  tapeChange: {
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },
});
