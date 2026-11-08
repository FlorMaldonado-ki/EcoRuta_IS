import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { getUnreadNotificationCount } from '../services/tripStorage';

interface NotificationBellProps {
  unreadCount?: number;
  onPress: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  unreadCount = getUnreadNotificationCount(),
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={styles.bellButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Notificaciones, ${unreadCount} no leídas`}
    >
      <MaterialCommunityIcons name="bell-outline" size={22} color={THEME.colors.accent} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bellButton: {
    padding: 6,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: THEME.colors.error,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
