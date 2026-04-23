import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

interface TermLine {
  text: string;
  type: 'prompt' | 'output' | 'error' | 'info' | 'accent';
}

const OUTPUT: TermLine[] = [
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
  { text: '$ pnpm run test', type: 'prompt' },
  { text: '', type: 'output' },
  { text: ' PASS  test/services/engine.test.ts', type: 'accent' },
  { text: ' PASS  test/services/wallet.test.ts', type: 'accent' },
  { text: ' PASS  test/shared/validation.test.ts', type: 'accent' },
  { text: '', type: 'output' },
  { text: 'Tests: 281 passed, 281 total', type: 'accent' },
  { text: 'Time:  3.847s', type: 'output' },
  { text: '', type: 'output' },
];

const TERMINALS = [
  { id: '1', label: 'bash', status: 'active' as const },
  { id: '2', label: 'claude', status: 'active' as const },
  { id: '3', label: 'dev', status: 'idle' as const },
];

function lineColor(type: string) {
  switch (type) {
    case 'prompt': return colors.green;
    case 'accent': return colors.green;
    case 'error': return colors.red;
    case 'info': return colors.t4;
    default: return colors.t2;
  }
}

export default function TerminalScreen() {
  const [lines] = useState<TermLine[]>(OUTPUT);
  const [input, setInput] = useState('');
  const [activeTerminal, setActiveTerminal] = useState('1');
  const scrollRef = useRef<ScrollView>(null);

  const handleSubmit = () => {
    if (!input.trim()) return;
    setInput('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Terminal</Text>
          <StatusDot color="amber" size={6} />
        </View>

        {/* Terminal picker */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.termBar}
          contentContainerStyle={styles.termBarInner}
        >
          {TERMINALS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setActiveTerminal(t.id)}
              style={[styles.termChip, activeTerminal === t.id && styles.termChipActive]}
            >
              <StatusDot
                color={t.status === 'active' ? colors.green : colors.amber}
                size={4}
              />
              <Text style={[
                styles.termChipText,
                activeTerminal === t.id && styles.termChipTextActive,
              ]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Output */}
        <ScrollView
          ref={scrollRef}
          style={styles.output}
          contentContainerStyle={styles.outputInner}
          showsVerticalScrollIndicator={false}
        >
          {lines.map((line, i) => {
            if (!line.text) return <View key={i} style={styles.emptyLine} />;
            return (
              <Text key={i} style={[styles.line, { color: lineColor(line.type) }]}>
                {line.text}
              </Text>
            );
          })}
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
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

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

  termBar: { maxHeight: 44, backgroundColor: colors.s1, borderBottomWidth: 1, borderBottomColor: colors.border },
  termBarInner: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  termChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  termChipActive: { borderColor: colors.amber + '50', backgroundColor: colors.amberGlow },
  termChipText: { color: colors.t3, fontSize: fontSize.xs, fontFamily: fonts.code },
  termChipTextActive: { color: colors.t1 },

  output: { flex: 1, backgroundColor: colors.bg },
  outputInner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  line: { fontFamily: fonts.code, fontSize: fontSize.xs, lineHeight: 20 },
  emptyLine: { height: 6 },

  cursorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  promptChar: { color: colors.green, fontFamily: fonts.code, fontSize: fontSize.xs, marginRight: 6 },
  cursor: { width: 7, height: 14, backgroundColor: colors.green, opacity: 0.6 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.s1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    height: 48,
    gap: spacing.sm,
  },
  inputPrompt: { color: colors.green, fontFamily: fonts.code, fontSize: fontSize.sm, fontWeight: '700' },
  inputField: { flex: 1, color: colors.green, fontFamily: fonts.code, fontSize: fontSize.sm, paddingVertical: 8 },
});
