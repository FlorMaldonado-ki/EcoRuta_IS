import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

interface HeaderProps {
  subtitle?: string;
  onOpenMenu?: () => void;
  rightElement?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  subtitle = 'TecNM Campus Morelia',
  onOpenMenu,
  rightElement,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          {onOpenMenu && (
            <TouchableOpacity
              style={styles.menuBurgerBtn}
              onPress={onOpenMenu}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Abrir menú"
            >
              <MaterialCommunityIcons name="menu" size={24} color={THEME.colors.accent} />
            </TouchableOpacity>
          )}

          <View style={styles.iconWrapper}>
            <MaterialCommunityIcons name="car-multiple" size={24} color={THEME.colors.accent} />
          </View>
          <View style={styles.titleColumn}>
            <Text style={styles.brandTitle}>
              Eco<Text style={styles.brandTitleAccent}>Ruta</Text>
            </Text>
            <Text style={styles.brandSubtitle}>Escolar · Carpooling</Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          {rightElement}
          <View style={styles.badge}>
            <MaterialCommunityIcons name="school" size={14} color={THEME.colors.accent} style={styles.badgeIcon} />
            <Text style={styles.badgeText}>{subtitle}</Text>
          </View>
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
    gap: 10,
  },
  menuBurgerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(197, 155, 39, 0.4)',
  },
  titleColumn: {
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textInverse,
    letterSpacing: -0.5,
  },
  brandTitleAccent: {
    color: THEME.colors.accent,
  },
  brandSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.3)',
  },
  badgeIcon: {
    marginRight: 6,
  },
  badgeText: {
    color: THEME.colors.textInverse,
    fontSize: 11,
    fontWeight: '600',
  },
  decorativeStripe: {
    marginTop: 12,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  goldLine: {
    width: '40%',
    height: '100%',
    backgroundColor: THEME.colors.accent,
  },
});
