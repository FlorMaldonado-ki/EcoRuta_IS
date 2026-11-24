/**
 * Bandeja de avisos (últimas 72 h). Se abre desde la campana, el menú o una alerta.
 * Encabezado guinda con línea dorada, filtros, grupos "Nuevas / Anteriores" y tarjetas
 * con icono por tipo. Tocar un aviso lo marca como leído y lleva a su sección.
 */
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, SectionList, SafeAreaView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { NOTIFICATION_META, SECTION_LABEL, relativeTime } from '../constants/notificationMeta';
import { useNotifications } from '../hooks/useNotifications';
import type { NotificationItem } from '../types/api';

type Filter = 'all' | 'unread' | 'critical';

const FILTERS: { key: Filter; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'all', label: 'Todas', icon: 'bell-outline' },
  { key: 'unread', label: 'Sin leer', icon: 'email-mark-as-unread' },
  { key: 'critical', label: 'Importantes', icon: 'alert-octagon-outline' },
];

export const NotificationsCenterModal: React.FC = () => {
  const { items, unread, centerOpen: visible, closeCenter, markRead, markAllRead, refresh, goToSection } =
    useNotifications();
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());

  // Al abrir: trae lo más reciente y fija la hora de referencia para "Hace X min".
  const handleShow = () => {
    refresh();
    setNow(Date.now());
  };

  const sections = useMemo(() => {
    const filtered = items.filter((n) =>
      filter === 'unread' ? !n.read : filter === 'critical' ? n.critical : true
    );
    const fresh = filtered.filter((n) => !n.read);
    const old = filtered.filter((n) => n.read);
    return [
      ...(fresh.length ? [{ title: 'Nuevas', data: fresh }] : []),
      ...(old.length ? [{ title: 'Anteriores', data: old }] : []),
    ];
  }, [items, filter]);

  const criticalCount = items.filter((n) => n.critical && !n.read).length;

  const handleItemPress = (item: NotificationItem) => {
    if (!item.read) markRead(item.id);
    goToSection(NOTIFICATION_META[item.type].section);
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const meta = NOTIFICATION_META[item.type];
    return (
      <TouchableOpacity
        style={[styles.item, !item.read && styles.itemUnread, item.critical && !item.read && styles.itemCritical]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.85}
      >
        {item.critical && <View style={styles.itemCriticalBar} />}

        <View style={[styles.itemIcon, { backgroundColor: item.read ? THEME.colors.surfaceAlt : meta.tint }]}>
          <MaterialCommunityIcons name={meta.icon} size={22} color={item.read ? THEME.colors.textMuted : meta.color} />
        </View>

        <View style={styles.itemBody}>
          <View style={styles.itemTop}>
            {item.critical ? (
              <View style={styles.importantChip}>
                <MaterialCommunityIcons name="alert-octagon" size={10} color="#FFFFFF" />
                <Text style={styles.importantChipText}>IMPORTANTE</Text>
              </View>
            ) : (
              <Text style={[styles.itemLabel, { color: meta.color }]}>{meta.label}</Text>
            )}
            <View style={styles.itemTimeRow}>
              <Text style={styles.itemTime}>{relativeTime(item.createdAt, now)}</Text>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
          </View>

          <Text
            style={[styles.itemTitle, !item.read && styles.itemTitleUnread, item.critical && !item.read && { color: THEME.colors.error }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text style={styles.itemMessage} numberOfLines={3}>
            {item.message}
          </Text>

          <View style={styles.itemFooter}>
            <View style={styles.sectionChip}>
              <Text style={styles.sectionChipText}>{SECTION_LABEL[meta.section]}</Text>
              <MaterialCommunityIcons name="chevron-right" size={14} color={THEME.colors.primary} />
            </View>
          </View>
        </View>

      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeCenter} onShow={handleShow}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTap} onPress={closeCenter} activeOpacity={1} />
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.grabber} />
            <View style={styles.headerRow}>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="bell-ring" size={22} color={THEME.colors.accent} />
              </View>
              <View style={styles.headerTexts}>
                <Text style={styles.headerTitle}>Notificaciones</Text>
                <Text style={styles.headerSub}>
                  {unread > 0 ? `${unread} sin leer` : 'Todo al día'} · últimas 72 horas
                </Text>
              </View>
              <TouchableOpacity onPress={closeCenter} style={styles.headerClose} accessibilityLabel="Cerrar">
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {criticalCount > 0 && (
              <View style={styles.criticalBanner}>
                <MaterialCommunityIcons name="alert-octagon" size={16} color="#FFFFFF" />
                <Text style={styles.criticalBannerText}>
                  {criticalCount === 1 ? 'Tienes 1 aviso importante sin leer' : `Tienes ${criticalCount} avisos importantes sin leer`}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.goldLine} />

          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name={f.icon} size={14} color={active ? '#FFFFFF' : THEME.colors.primary} />
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
            {unread > 0 && (
              <TouchableOpacity onPress={markAllRead} style={styles.markAll} hitSlop={8}>
                <MaterialCommunityIcons name="check-all" size={16} color={THEME.colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <Text style={styles.groupTitle}>{section.title}</Text>
            )}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <MaterialCommunityIcons name="bell-check-outline" size={40} color={THEME.colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>
                  {filter === 'all' ? 'Bandeja al día' : filter === 'unread' ? 'No tienes avisos sin leer' : 'Sin avisos importantes'}
                </Text>
                <Text style={styles.emptySub}>
                  Aquí verás las solicitudes, respuestas y cancelaciones de tus viajes.
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(79, 15, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  overlayTap: {
    flex: 1,
  },
  sheet: {
    backgroundColor: THEME.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    minHeight: '55%',
    overflow: 'hidden',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: 8,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(197,155,39,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 1,
  },
  headerClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: THEME.colors.error,
    borderRadius: THEME.borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  criticalBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  goldLine: {
    height: 3,
    backgroundColor: THEME.colors.accent,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.borderRadius.pill,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  filterChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  markAll: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    flexGrow: 1,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
    ...THEME.shadows.card,
  },
  itemUnread: {
    borderColor: 'rgba(107, 23, 54, 0.25)',
  },
  itemCritical: {
    backgroundColor: '#FFF7F7',
    borderColor: THEME.colors.errorBorder,
  },
  itemCriticalBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: THEME.colors.error,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  itemLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  importantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: THEME.colors.error,
    borderRadius: THEME.borderRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  importantChipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  itemTime: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  itemTitleUnread: {
    fontWeight: '800',
  },
  itemMessage: {
    fontSize: 12,
    lineHeight: 17,
    color: THEME.colors.textSecondary,
    marginTop: 3,
  },
  itemFooter: {
    flexDirection: 'row',
    marginTop: 8,
  },
  sectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySoft,
    borderRadius: THEME.borderRadius.pill,
    paddingLeft: 9,
    paddingRight: 4,
    paddingVertical: 2,
  },
  sectionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  itemTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: THEME.colors.accent,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: THEME.colors.primarySoft,
    borderWidth: 1.5,
    borderColor: THEME.colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
});
