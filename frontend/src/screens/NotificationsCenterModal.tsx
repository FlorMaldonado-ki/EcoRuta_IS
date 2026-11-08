import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/tripStorage';
import type { NotificationItem, NotificationType } from '../types/api';

interface NotificationsCenterModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectNotification?: (item: NotificationItem) => void;
}

export const NotificationsCenterModal: React.FC<NotificationsCenterModalProps> = ({
  visible,
  onClose,
  onSelectNotification,
}) => {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const refreshList = () => {
    setItems(getNotifications());
  };

  useEffect(() => {
    if (visible) {
      refreshList();
    }
  }, [visible]);

  const handleItemPress = (item: NotificationItem) => {
    markNotificationAsRead(item.id);
    refreshList();
    onSelectNotification?.(item);
  };

  const handleMarkAll = () => {
    markAllNotificationsAsRead();
    refreshList();
  };

  const getIconForType = (type: NotificationType): { name: keyof typeof MaterialCommunityIcons.glyphMap; color: string } => {
    switch (type) {
      case 'solicitud_aceptada':
        return { name: 'check-circle-outline', color: THEME.colors.success };
      case 'solicitud_rechazada':
        return { name: 'close-circle-outline', color: THEME.colors.error };
      case 'solicitud_recibida':
        return { name: 'account-plus-outline', color: THEME.colors.primary };
      case 'viaje_cancelado':
      case 'lugar_cancelado':
      case 'solicitud_cancelada':
        return { name: 'alert-circle-outline', color: THEME.colors.warning };
      case 'viaje_proximo':
        return { name: 'clock-fast', color: THEME.colors.accentDark };
      default:
        return { name: 'bell-outline', color: THEME.colors.primary };
    }
  };

  const formatRelativeTime = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const days = Math.floor(diffHours / 24);
    return `Hace ${days} día${days > 1 ? 's' : ''}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="bell-ring" size={22} color={THEME.colors.primary} />
              <View>
                <Text style={styles.title}>Notificaciones</Text>
                <Text style={styles.retentionNotice}>Conservación activa: últimas 72 horas</Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Barra de acciones si hay elementos */}
          {items.length > 0 && (
            <View style={styles.actionBar}>
              <Text style={styles.itemsCountText}>{items.length} aviso(s)</Text>
              <TouchableOpacity onPress={handleMarkAll} style={styles.markAllBtn}>
                <MaterialCommunityIcons name="check-all" size={16} color={THEME.colors.primary} />
                <Text style={styles.markAllText}>Marcar todo como leído</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Lista de Notificaciones */}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="bell-sleep-outline" size={54} color={THEME.colors.textMuted} />
                <Text style={styles.emptyTitle}>Bandeja al día</Text>
                <Text style={styles.emptySubtitle}>
                  No tienes notificaciones en las últimas 72 horas. Los avisos de solicitudes y viajes aparecerán aquí mientras uses la app.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const iconData = getIconForType(item.type);
              return (
                <TouchableOpacity
                  style={[styles.itemCard, !item.read && styles.itemCardUnread]}
                  onPress={() => handleItemPress(item)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.iconWrapper, { backgroundColor: iconData.color + '18' }]}>
                    <MaterialCommunityIcons name={iconData.name} size={22} color={iconData.color} />
                  </View>

                  <View style={styles.itemTextContent}>
                    <View style={styles.itemTopRow}>
                      <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]}>
                        {item.title}
                      </Text>
                      <Text style={styles.itemTime}>{formatRelativeTime(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.itemMessage}>{item.message}</Text>
                  </View>

                  {!item.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  cardContainer: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: THEME.borderRadius.xl,
    borderTopRightRadius: THEME.borderRadius.xl,
    maxHeight: '85%',
    minHeight: '50%',
    overflow: 'hidden',
    ...THEME.shadows.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  retentionNotice: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  closeBtn: {
    padding: 6,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: THEME.colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  itemsCountText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllText: {
    fontSize: 12,
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surface,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 12,
  },
  itemCardUnread: {
    backgroundColor: THEME.colors.primarySoft,
    borderColor: 'rgba(107, 23, 54, 0.25)',
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTextContent: {
    flex: 1,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  itemTitleUnread: {
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  itemTime: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  itemMessage: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.primary,
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
});

