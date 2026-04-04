import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, fontSize } from '@/theme/tokens';

interface TabIconProps {
  char: string;
  focused: boolean;
  accentColor?: string;
}

function TabIcon({ char, focused, accentColor }: TabIconProps) {
  const active = accentColor ?? colors.green;
  return (
    <View style={styles.iconWrap}>
      <Text
        style={[
          styles.iconChar,
          { color: focused ? active : colors.t4 },
        ]}
      >
        {char}
      </Text>
      {focused && (
        <View style={[styles.activeDot, { backgroundColor: active }]} />
      )}
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
      }}
    >
      <Tabs.Screen
        name="agent"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon char=">" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon char="$" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="code"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon char="{}" focused={focused} accentColor={colors.blue} />
          ),
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon char="_" focused={focused} accentColor={colors.amber} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon char="..." focused={focused} accentColor={colors.t3} />
          ),
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
    height: 52,
    paddingBottom: 0,
    paddingTop: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    gap: 3,
  },
  iconChar: {
    fontFamily: fonts.code,
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
  activeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
