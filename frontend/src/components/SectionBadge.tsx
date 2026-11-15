/**
 * Círculo en la esquina de una tarjeta o elemento del menú que anuncia avisos de esa sección.
 *  - normal: guinda con borde dorado (colores institucionales)
 *  - critical (hay cancelaciones sin ver): rojo con un anillo que pulsa
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { THEME } from '../constants/theme';

interface SectionBadgeProps {
  count: number;
  critical?: boolean;
  /** 'corner' = flotando en la esquina superior derecha de una tarjeta; 'inline' = dentro de una fila */
  variant?: 'corner' | 'inline';
  style?: ViewStyle;
}

export const SectionBadge: React.FC<SectionBadgeProps> = ({ count, critical = false, variant = 'corner', style }) => {
  const [ring] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!critical || count <= 0) return;
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    ring.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [critical, count, ring]);

  if (count <= 0) return null;
  const color = critical ? THEME.colors.error : THEME.colors.primary;
  const text = count > 9 ? '9+' : String(count);

  return (
    <View
      style={[variant === 'corner' ? styles.corner : styles.inline, style]}
      pointerEvents="none"
      accessibilityLabel={`${count} ${count === 1 ? 'aviso nuevo' : 'avisos nuevos'}`}
    >
      {critical && (
        <Animated.View
          style={[
            styles.ring,
            { borderColor: color },
            {
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
            },
          ]}
        />
      )}
      <View style={[styles.circle, { backgroundColor: color }]}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
};

const SIZE = 24;

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 2,
  },
  inline: {
    marginLeft: 'auto',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  circle: {
    minWidth: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
});
