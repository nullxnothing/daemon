import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSize } from '@/theme/tokens';

function TabIcon({ label, focused, accent }: { label: string; focused: boolean; accent?: string }) {
  const active = accent ?? colors.green;
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.iconLabel, { color: focused ? active : colors.t4 }]}>
        {label}
      </Text>
      {focused && <View style={[styles.indicator, { backgroundColor: active }]} />}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.t4,
      }}
    >
      <Tabs.Screen
        name="agent"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Agent" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Wallet" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Projects" focused={focused} accent={colors.blue} />,
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Term" focused={focused} accent={colors.amber} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Settings" focused={focused} accent={colors.t2} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.s1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 56,
    paddingTop: 4,
    paddingBottom: 4,
    elevation: 0,
    shadowOpacity: 0,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 44,
    gap: 4,
  },
  iconLabel: {
    fontFamily: fonts.code,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  indicator: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
});