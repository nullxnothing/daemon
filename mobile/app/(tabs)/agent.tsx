import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

const ARIA_ART = `    /\\
   /  \\
  / .. \\
 / .__. \\
/________\\`;

interface Session {
  id: string;
  model: string;
  modelColor: string;
  status: 'active' | 'idle' | 'stopped';
  project: string;
  started: string;
  tokens: string;
}

const SESSIONS: Session[] = [
  {
    id: '1',
    model: 'OPUS',
    modelColor: colors.purple,
    status: 'active',
    project: 'DAEMON',
    started: '2h ago',
    tokens: '847K',
  },
  {
    id: '2',
    model: 'SONNET',
    modelColor: colors.blue,
    status: 'active',
    project: 'DAEMON/mobile',
    started: '14m ago',
    tokens: '124K',
  },
  {
    id: '3',
    model: 'SONNET',
    modelColor: colors.blue,
    status: 'idle',
    project: 'jefflink',
    started: '6h ago',
    tokens: '2.1M',
  },
];

interface TermLine {
  text: string;
  type: 'prompt' | 'output' | 'info' | 'accent';
}

const CLI_OUTPUT: TermLine[] = [
  { text: '  DAEMON v0.2.0 | ARIA Agent Runtime', type: 'info' },
  { text: '  Model: claude-opus-4-20250514', type: 'info' },
  { text: '  Permissions: plan mode', type: 'info' },
  { text: '', type: 'output' },
  { text: '> Analyzing project structure...', type: 'accent' },
  { text: '  Found 142 files across 21 directories', type: 'output' },
  { text: '  TypeScript: 89 | CSS: 23 | Config: 30', type: 'output' },
  { text: '', type: 'output' },
  { text: '> Running typecheck...', type: 'accent' },
  { text: '  0 errors, 0 warnings', type: 'output' },
  { text: '', type: 'output' },
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

export default function AgentScreen() {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar - matches desktop */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.brandText}>DAEMON</Text>
          <View style={styles.tabPill}>
            <Text style={styles.tabPillText}>Claude</Text>
          </View>
        </View>
        <View style={styles.topBarRight}>
          <Text style={styles.balanceText}>$0.92</Text>
          <StatusDot color="green" size={5} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ARIA ascii art */}
          <View style={styles.ariaBlock}>
            <Text style={styles.ariaArt}>{ARIA_ART}</Text>
            <Text style={styles.ariaLabel}>ARIA</Text>
            <Text style={styles.ariaSub}>Agent Runtime Interface Architecture</Text>
          </View>

          {/* Session cards */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>SESSIONS</Text>
            <Text style={styles.sectionCount}>{SESSIONS.length}</Text>
          </View>

          {SESSIONS.map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={styles.sessionTop}>
                <View style={styles.sessionTopLeft}>
                  <StatusDot color={statusDotColor(session.status)} size={5} />
                  <Text style={styles.sessionProject}>{session.project}</Text>
                </View>
                <ModelBadge model={session.model} color={session.modelColor} />
              </View>
              <View style={styles.sessionMeta}>
                <Text style={styles.sessionMetaText}>{session.started}</Text>
                <Text style={styles.sessionMetaDot}> / </Text>
                <Text style={styles.sessionMetaText}>{session.tokens} tokens</Text>
                <Text style={styles.sessionMetaDot}> / </Text>
                <Text style={[
                  styles.sessionMetaText,
                  { color: session.status === 'active' ? colors.green : session.status === 'idle' ? colors.amber : colors.t4 },
                ]}>
                  {session.status}
                </Text>
              </View>
            </View>
          ))}

          {/* CLI output preview */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>CLI OUTPUT</Text>
          </View>

          <View style={styles.cliBlock}>
            {CLI_OUTPUT.map((line, i) => {
              if (!line.text) return <View key={i} style={styles.cliEmpty} />;
              return (
                <Text
                  key={i}
                  style={[
                    styles.cliLine,
                    line.type === 'prompt' && { color: colors.green },
                    line.type === 'accent' && { color: colors.green },
                    line.type === 'info' && { color: colors.t4 },
                    line.type === 'output' && { color: colors.t2 },
                  ]}
                >
                  {line.text}
                </Text>
              );
            })}
            <View style={styles.cursorRow}>
              <Text style={styles.promptChar}>$</Text>
              <View style={styles.cursor} />
            </View>
          </View>
        </ScrollView>

        {/* Input bar - Claude CLI style */}
        <View style={styles.inputBar}>
          <View style={styles.inputRow}>
            <Text style={styles.inputPrompt}>{'>'}</Text>
            <TextInput
              style={styles.inputField}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message ARIA..."
              placeholderTextColor={colors.t4}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                pressed && styles.sendBtnPressed,
                !inputText.trim() && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Text style={[
                styles.sendBtnText,
                !inputText.trim() && { color: colors.t4 },
              ]}>{'>'}</Text>
            </Pressable>
          </View>
          <Text style={styles.inputHint}>plan mode | opus-4</Text>
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
    color: colors.t2,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  balanceText: {
    color: colors.t3,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  // ARIA block
  ariaBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ariaArt: {
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    lineHeight: 14,
    color: colors.t4,
    textAlign: 'center',
  },
  ariaLabel: {
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.green,
    letterSpacing: 4,
    marginTop: spacing.sm,
  },
  ariaSub: {
    fontFamily: fonts.code,
    fontSize: fontSize.xxs,
    color: colors.t4,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.s2,
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
    backgroundColor: colors.bg,
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
  },
  sessionMetaText: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  sessionMetaDot: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    opacity: 0.5,
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

  // CLI block
  cliBlock: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cliLine: {
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    lineHeight: 20,
  },
  cliEmpty: {
    height: 8,
  },
  cursorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
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

  // Input bar
  inputBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.s1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputPrompt: {
    color: colors.green,
    fontFamily: fonts.code,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  inputField: {
    flex: 1,
    backgroundColor: colors.s2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.t1,
    fontSize: fontSize.sm,
    fontFamily: fonts.code,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    backgroundColor: colors.greenDim,
  },
  sendBtnDisabled: {
    backgroundColor: colors.s3,
  },
  sendBtnText: {
    color: colors.bg,
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontFamily: fonts.code,
  },
  inputHint: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
    marginTop: spacing.xs,
    marginLeft: spacing.xl,
  },
});
