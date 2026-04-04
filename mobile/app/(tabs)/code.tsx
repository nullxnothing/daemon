import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusDot } from '@/components/StatusDot';
import { colors, spacing, fontSize, fonts, radii } from '@/theme/tokens';

interface FileNode {
  name: string;
  type: 'dir' | 'file';
  children?: FileNode[];
  ext?: string;
}

const FILE_TREE: FileNode[] = [
  {
    name: '.claude', type: 'dir', children: [
      { name: 'settings.json', type: 'file', ext: 'json' },
    ],
  },
  {
    name: '.github', type: 'dir', children: [
      {
        name: 'workflows', type: 'dir', children: [
          { name: 'ci.yml', type: 'file', ext: 'yml' },
          { name: 'release.yml', type: 'file', ext: 'yml' },
        ],
      },
    ],
  },
  {
    name: 'electron', type: 'dir', children: [
      {
        name: 'main', type: 'dir', children: [
          { name: 'index.ts', type: 'file', ext: 'ts' },
        ],
      },
      {
        name: 'ipc', type: 'dir', children: [
          { name: 'agent.ts', type: 'file', ext: 'ts' },
          { name: 'wallet.ts', type: 'file', ext: 'ts' },
          { name: 'tools.ts', type: 'file', ext: 'ts' },
        ],
      },
      { name: 'preload', type: 'dir' },
    ],
  },
  {
    name: 'src', type: 'dir', children: [
      {
        name: 'panels', type: 'dir', children: [
          { name: 'Editor', type: 'dir' },
          { name: 'Terminal', type: 'dir' },
          { name: 'Claude', type: 'dir' },
          { name: 'WalletPanel', type: 'dir' },
        ],
      },
      { name: 'store', type: 'dir' },
      { name: 'App.tsx', type: 'file', ext: 'tsx' },
      { name: 'App.css', type: 'file', ext: 'css' },
    ],
  },
  { name: 'package.json', type: 'file', ext: 'json' },
  { name: 'tsconfig.json', type: 'file', ext: 'json' },
  { name: 'AGENTS.md', type: 'file', ext: 'md' },
  { name: 'vite.config.ts', type: 'file', ext: 'ts' },
];

const TABS = ['package.json', 'AGENTS.md'];

const PREVIEW_LINES = [
  { num: 1, text: '{', color: colors.t2 },
  { num: 2, text: '  "name": "daemon",', color: colors.t2 },
  { num: 3, text: '  "version": "0.2.0",', color: colors.t2 },
  { num: 4, text: '  "private": true,', color: colors.t2 },
  { num: 5, text: '  "type": "module",', color: colors.t2 },
  { num: 6, text: '  "main": "dist/electron/main/index.js",', color: colors.t2 },
  { num: 7, text: '  "scripts": {', color: colors.t2 },
  { num: 8, text: '    "dev": "vite",', color: colors.green },
  { num: 9, text: '    "build": "tsc && vite build",', color: colors.t2 },
  { num: 10, text: '    "typecheck": "tsc --noEmit",', color: colors.t2 },
  { num: 11, text: '    "test": "vitest run",', color: colors.t2 },
  { num: 12, text: '    "package": "electron-builder"', color: colors.t2 },
  { num: 13, text: '  },', color: colors.t2 },
  { num: 14, text: '  "dependencies": {', color: colors.t2 },
  { num: 15, text: '    "react": "^18.3.1",', color: colors.blue },
  { num: 16, text: '    "react-dom": "^18.3.1",', color: colors.blue },
  { num: 17, text: '    "zustand": "^5.0.3",', color: colors.t2 },
  { num: 18, text: '    "monaco-editor": "^0.52.0",', color: colors.amber },
  { num: 19, text: '    "@anthropic-ai/sdk": "^0.39.0"', color: colors.purple },
  { num: 20, text: '  }', color: colors.t2 },
  { num: 21, text: '}', color: colors.t2 },
];

function extColor(ext?: string): string {
  if (!ext) return colors.t3;
  const map: Record<string, string> = {
    ts: colors.blue, tsx: colors.blue,
    json: colors.amber, yml: colors.green,
    css: colors.purple, md: colors.t2,
  };
  return map[ext] ?? colors.t3;
}

interface FlatNode {
  path: string;
  name: string;
  type: 'dir' | 'file';
  depth: number;
  ext?: string;
  hasChildren: boolean;
}

function flatten(nodes: FileNode[], expanded: Set<string>, path = '', depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    const fullPath = path ? `${path}/${node.name}` : node.name;
    result.push({
      path: fullPath,
      name: node.name,
      type: node.type,
      depth,
      ext: node.ext,
      hasChildren: !!node.children?.length,
    });
    if (node.type === 'dir' && node.children && expanded.has(fullPath)) {
      result.push(...flatten(node.children, expanded, fullPath, depth + 1));
    }
  }
  return result;
}

export default function CodeScreen() {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(['src', 'electron', 'src/panels'])
  );
  const [selectedFile, setSelectedFile] = useState<string | null>('package.json');
  const [activeTab, setActiveTab] = useState('package.json');

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const flatFiles = flatten(FILE_TREE, expanded);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.brandText}>DAEMON</Text>
          <StatusDot color="blue" size={5} />
        </View>
        <Text style={styles.projectPath}>~/DAEMON</Text>
      </View>

      {/* File tabs */}
      <View style={styles.fileTabs}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.fileTab,
              activeTab === tab && styles.fileTabActive,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.fileTabText,
              activeTab === tab && styles.fileTabTextActive,
            ]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Main area: tree + editor split */}
      <View style={styles.splitView}>
        {/* FILES panel header */}
        <View style={styles.panelHeader}>
          <Text style={styles.panelHeaderText}>FILES</Text>
        </View>

        {/* File tree */}
        <ScrollView style={styles.fileTree} showsVerticalScrollIndicator={false}>
          {flatFiles.map((node) => {
            const isDir = node.type === 'dir';
            const isExpanded = expanded.has(node.path);
            const isSelected = selectedFile === node.path;

            return (
              <Pressable
                key={node.path}
                style={[
                  styles.fileRow,
                  isSelected && styles.fileRowSelected,
                ]}
                onPress={() => {
                  if (isDir) toggleDir(node.path);
                  else {
                    setSelectedFile(node.path);
                    setActiveTab(node.name);
                  }
                }}
              >
                <View style={{ width: node.depth * 14 }} />
                <Text style={styles.fileChevron}>
                  {isDir
                    ? (isExpanded ? '\u25BE' : '\u25B8')
                    : ' '
                  }
                </Text>
                <Text
                  style={[
                    styles.fileName,
                    isDir && styles.dirName,
                    !isDir && { color: extColor(node.ext) },
                    isSelected && !isDir && styles.fileNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {node.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Editor pane */}
        <View style={styles.editorPane}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorFileName}>{activeTab}</Text>
            <Text style={styles.editorLang}>JSON</Text>
          </View>
          <ScrollView style={styles.editorBody} showsVerticalScrollIndicator={false}>
            {PREVIEW_LINES.map((line) => (
              <View key={line.num} style={styles.codeLine}>
                <Text style={styles.lineNum}>{line.num}</Text>
                <Text style={[styles.codeText, { color: line.color }]} numberOfLines={1}>
                  {line.text}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
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
    gap: spacing.sm,
  },
  brandText: {
    color: colors.t1,
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontFamily: fonts.code,
    letterSpacing: 2,
  },
  projectPath: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },

  // File tabs
  fileTabs: {
    flexDirection: 'row',
    backgroundColor: colors.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  fileTabActive: {
    backgroundColor: colors.bg,
    borderBottomWidth: 2,
    borderBottomColor: colors.blue,
  },
  fileTabText: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  fileTabTextActive: {
    color: colors.t1,
  },

  // Split view
  splitView: {
    flex: 1,
  },

  // Panel header
  panelHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelHeaderText: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontWeight: '600',
    fontFamily: fonts.code,
    letterSpacing: 1.5,
  },

  // File tree
  fileTree: {
    maxHeight: 220,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    minHeight: 26,
  },
  fileRowSelected: {
    backgroundColor: colors.s2,
  },
  fileChevron: {
    color: colors.t4,
    fontSize: 10,
    fontFamily: fonts.code,
    width: 12,
    textAlign: 'center',
  },
  fileName: {
    color: colors.t2,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    marginLeft: spacing.xs,
  },
  dirName: {
    color: colors.t1,
    fontWeight: '500',
  },
  fileNameSelected: {
    fontWeight: '600',
  },

  // Editor pane
  editorPane: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editorFileName: {
    color: colors.t2,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
  },
  editorLang: {
    color: colors.t4,
    fontSize: fontSize.xxs,
    fontFamily: fonts.code,
  },
  editorBody: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  codeLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
  lineNum: {
    color: colors.t4,
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    width: 28,
    textAlign: 'right',
    marginRight: spacing.md,
    lineHeight: 22,
    opacity: 0.6,
  },
  codeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.code,
    lineHeight: 22,
    flex: 1,
  },
});
