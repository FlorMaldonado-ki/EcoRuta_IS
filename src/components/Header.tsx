import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

interface HeaderProps {
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ subtitle = 'TecNM Campus Morelia' }) => {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons name="car-multiple" size={26} color={THEME.colors.accent} />
          </View>
          <View style={styles.titleColumn}>
            <Text style={styles.brandTitle}>
              Eco<Text style={styles.brandTitleAccent}>Ruta</Text>
            </Text>
            <Text style={styles.brandSubtitle}>Escolar · Carpooling</Text>
          </View>
        </View>

        <View style={styles.badge}>
          <MaterialCommunityIcons name="school" size={14} color={THEME.colors.accent} style={styles.badgeIcon} />
          <Text style={styles.badgeText}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.decorativeStripe}>
        <View style={styles.goldLine} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.colors.primary,
    paddingTop: Platform.OS === 'web' ? 24 : 12,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...THEME.shadows.hover,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.4)',
  },
  titleColumn: {
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textInverse,
    letterSpacing: 0.3,
  },
  brandTitleAccent: {
    color: THEME.colors.accent,
  },
  brandSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.35)',
  },
  badgeIcon: {
    marginRight: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  decorativeStripe: {
    marginTop: 14,
    height: 3,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  goldLine: {
    height: '100%',
    width: '40%',
    backgroundColor: THEME.colors.accent,
    borderRadius: 2,
  },
});
