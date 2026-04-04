import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

const ARIA_SMALL = `  /\\
 /..\\
/____\\`;

interface TermLine {
  text: string;
  type: 'prompt' | 'output' | 'error' | 'info' | 'accent';
}

const INITIAL_OUTPUT: TermLine[] = [
  { text: '', type: 'output' },
  { text: '  DAEMON Terminal v0.2.0', type: 'info' },
  { text: '  Session: bash | Permissions: plan mode', type: 'info' },
  { text: '  Model: claude-opus-4-20250514', type: 'info' },
  { text: '', type: 'output' },
  { text: '$ node --version', type: 'prompt' },
  { text: 'v22.12.0', type: 'output' },
  { text: '', type: 'output' },
  { text: '$ pnpm run typecheck', type: 'prompt' },
  { text: '', type: 'output' },
  { text: '> daemon@0.2.0 typecheck', type: 'output' },
  { text: '> tsc --noEmit', type: 'output' },
  { text: '', type: 'output' },
  { text: 'Done in 4.2s', type: 'accent' },
  { text: '', type: 'output' },
  { text: '$ solana balance', type: 'prompt' },
  { text: '24.891200000 SOL', type: 'output' },
  { text: '', type: 'output' },
  { text: '$ git status', type: 'prompt' },
  { text: 'On branch hackathon/frontier', type: 'output' },
  { text: 'nothing to commit, working tree clean', type: 'accent' },
  { text: '', type: 'output' },
];

export default function TerminalScreen() {
  const [lines, setLines] = useState<TermLine[]>(INITIAL_OUTPUT);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const handleSubmit = () => {
    const cmd = input.trim();
    if (!cmd) return;

    const newLines: TermLine[] = [
      { text: `$ ${cmd}`, type: 'prompt' },
      { text: `Command sent: ${cmd}`, type: 'output' },
      { text: '', type: 'output' },
    ];

    setLines((prev) => [...prev, ...newLines]);
    setInput('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.brandText}>DAEMON</Text>
          <View style={styles.tabPill}>
            <Text style={styles.tabPillText}>Terminal</Text>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <Text style={styles.sessionInfo}>bash</Text>
          <StatusDot color="amber" size={5} />
        </View>
      </View>

      {/* Info bar */}
      <View style={styles.infoBar}>
        <Text style={styles.infoText}>1 terminal</Text>
        <Text style={styles.infoSep}>|</Text>
        <Text style={styles.infoText}>plan mode</Text>
        <Text style={styles.infoSep}>|</Text>
        <Text style={styles.infoText}>node v22.12.0</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Terminal output */}
        <ScrollView
          ref={scrollRef}
          style={styles.termBody}
          contentContainerStyle={styles.termContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ARIA watermark */}
          <View style={styles.ariaWatermark}>
            <Text style={styles.ariaArt}>{ARIA_SMALL}</Text>
          </View>

          {lines.map((line, i) => {
            if (!line.text) return <View key={i} style={styles.emptyLine} />;
            return (
              <Text
                key={i}
                style={[
                  styles.termLine,
                  line.type === 'prompt' && styles.linePrompt,
                  line.type === 'output' && styles.lineOutput,
                  line.type === 'error' && styles.lineError,
                  line.type === 'info' && styles.lineInfo,
                  line.type === 'accent' && styles.lineAccent,
                ]}
              >
                {line.text}
              </Text>
            );
          })}

          {/* Cursor */}
          <View style={styles.cursorRow}>
            <Text style={styles.promptChar}>$</Text>
            <View style={styles.cursor} />
          </View>
        </ScrollView>

        {/* Input */}
        <View style={styles.inputBar}>
          <Text style={styles.inputPrompt}>$</Text>
          <TextInput
            style={styles.inputField}
            value={input}
            onChangeText={setInput}
            placeholder="command..."
            placeholderTextColor={colors.t4}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            blurOnSubmit={false}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },

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
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    color: colors.amber,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  sessionInfo: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },

  // Info bar
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  infoText: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },
  infoSep: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    opacity: 0.4,
  },

  // Terminal body
  termBody: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  termContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },

  // ARIA watermark
  ariaWatermark: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.sm,
    opacity: 0.08,
  },
  ariaArt: {
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    lineHeight: 14,
    color: colors.t1,
  },

  termLine: {
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    lineHeight: 20,
  },
  linePrompt: {
    color: colors.green,
  },
  lineOutput: {
    color: colors.t2,
  },
  lineError: {
    color: colors.red,
  },
  lineInfo: {
    color: colors.t4,
  },
  lineAccent: {
    color: colors.green,
    opacity: 0.8,
  },
  emptyLine: {
    height: 8,
  },

  // Cursor
  cursorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  promptChar: {
    color: colors.green,
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    marginRight: spacing.xs,
  },
  cursor: {
    width: 7,
    height: 14,
    backgroundColor: colors.green,
    opacity: 0.6,
  },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 44,
  },
  inputPrompt: {
    color: colors.green,
    fontFamily: fonts.code,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  inputField: {
    flex: 1,
    color: colors.green,
    fontFamily: fonts.code,
    fontSize: fontSize.sm,
    paddingVertical: spacing.sm,
  },
});
