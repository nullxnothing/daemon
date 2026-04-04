import { View, StyleSheet } from 'react-native';
import { colors, type ColorKey } from '@/theme/tokens';

interface StatusDotProps {
  color?: ColorKey | string;
  size?: number;
  pulse?: boolean;
}

export function StatusDot({ color = 'green', size = 5, pulse }: StatusDotProps) {
  const resolvedColor = color in colors ? colors[color as ColorKey] : color;

  return (
    <View style={styles.container}>
      {pulse && (
        <View
          style={[
            styles.pulseRing,
            {
              width: size * 3,
              height: size * 3,
              borderRadius: size * 1.5,
              backgroundColor: resolvedColor,
              opacity: 0.2,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: resolvedColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
  },
  pulseRing: {
    position: 'absolute',
  },
});
