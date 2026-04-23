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
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

const CHAT_PREVIEW: ChatMessage[] = [
  { id: '1', role: 'user', text: 'Add biometric auth to the wallet send flow', time: '2m ago' },
  { id: '2', role: 'assistant', text: 'I\'ll add expo-local-authentication to the send confirmation. Transfers over 1 SOL will require FaceID/TouchID before signing.', time: '2m ago' },
  { id: '3', role: 'user', text: 'Also add a confirmation dialog for any send', time: '1m ago' },
  { id: '4', role: 'assistant', text: 'Done. All sends now show a confirmation sheet with amount, recipient, and estimated fee before signing.', time: 'just now' },
];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }]}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

function statusColor(s: string) {
  return s === 'active' ? colors.green : s === 'idle' ? colors.amber : colors.t4;
}

export default function AgentScreen() {
  const [input, setInput] = useState('');
  const [activeId, setActiveId] = useState('1');
  const scrollRef = useRef<ScrollView>(null);

  const session = SESSIONS.find((s) => s.id === activeId);

  const handleSend = () => {
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
          <Text style={styles.title}>Agent</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.costLabel}>$0.92</Text>
            <StatusDot color="green" size={6} />
          </View>
        </View>

        {/* Session chips — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipBar}
          contentContainerStyle={styles.chipBarInner}
        >
          {SESSIONS.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setActiveId(s.id)}
              style={[styles.chip, activeId === s.id && styles.chipActive]}
            >
              <StatusDot color={statusColor(s.status)} size={5} />
              <Text style={[styles.chipText, activeId === s.id && styles.chipTextActive]} numberOfLines={1}>
                {s.project}
              </Text>
              <Badge label={s.model} color={s.modelColor} />
            </Pressable>
          ))}
        </ScrollView>

        {/* Session meta row */}
        {session && (
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{session.started}</Text>
            <View style={styles.metaSep} />
            <Text style={styles.meta}>{session.tokens} tokens</Text>
            <View style={styles.metaSep} />
            <Text style={styles.meta}>{session.cost}</Text>
            <View style={styles.metaSep} />
            <Text style={[styles.meta, { color: statusColor(session.status) }]}>{session.status}</Text>
          </View>
        )}

        {/* Chat */}
        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={styles.chatInner}
          showsVerticalScrollIndicator={false}
        >
          {CHAT_PREVIEW.map((msg) => (
            <View
              key={msg.id}
              style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}
            >
              <Text style={styles.bubbleText}>{msg.text}</Text>
              <Text style={styles.bubbleTime}>{msg.time}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            value={input}
            onChangeText={setInput}
            placeholder="Message agent..."
            placeholderTextColor={colors.t4}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, !input.trim() && styles.sendBtnOff]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={[styles.sendArrow, !input.trim() && { color: colors.t4 }]}>{'\u2191'}</Text>
          </Pressable>
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
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  costLabel: { color: colors.t3, fontSize: fontSize.xs, fontFamily: fonts.code },

  chipBar: { maxHeight: 52, backgroundColor: colors.s1, borderBottomWidth: 1, borderBottomColor: colors.border },
  chipBarInner: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.lg,
    backgroundColor: colors.s2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.green + '50', backgroundColor: colors.greenGlow },
  chipText: { color: colors.t3, fontSize: fontSize.xs, fontFamily: fonts.code, maxWidth: 110 },
  chipTextActive: { color: colors.t1 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    backgroundColor: colors.s1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  meta: { color: colors.t4, fontSize: fontSize.xxs, fontFamily: fonts.code },
  metaSep: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.t4, opacity: 0.4 },

  chat: { flex: 1 },
  chatInner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  bubble: { maxWidth: '85%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.s4, borderBottomRightRadius: 2 },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 2 },
  bubbleText: { color: colors.t1, fontSize: fontSize.sm, lineHeight: 20 },
  bubbleTime: { color: colors.t4, fontSize: fontSize.xxs, marginTop: 4, alignSelf: 'flex-end' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.s1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    backgroundColor: colors.s3,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    color: colors.t1,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: colors.s4 },
  sendArrow: { color: colors.bg, fontSize: fontSize.md, fontWeight: '700' },

  badge: { borderRadius: radii.sm, paddingHorizontal: 5, paddingVertical: 1 },
  badgeLabel: { fontSize: 8, fontWeight: '700', fontFamily: fonts.code, letterSpacing: 0.5 },
});