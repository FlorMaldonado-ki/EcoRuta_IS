import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';
import { getDriverRoute } from '../services/tripStorage';
import { useNotifications } from '../hooks/useNotifications';
import { SectionBadge } from './SectionBadge';
import type { UserDTO } from '../types/api';

export type AppNavScreen =
  | 'home'
  | 'passenger_search'
  | 'publish_trip'
  | 'driver_route'
  | 'driver_test_route'
  | 'driver_requests'
  | 'my_trips'
  | 'driver_profile_vehicle'
  | 'notifications';

interface NavigationDrawerProps {
  visible: boolean;
  onClose: () => void;
  currentUser: UserDTO;
  currentScreen: AppNavScreen;
  onNavigate: (screen: AppNavScreen) => void;
  onLogout: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  visible,
  onClose,
  currentUser,
  currentScreen,
  onNavigate,
  onLogout,
}) => {
  const driverRoute = getDriverRoute();
  const { unread: unreadNotifs, badges } = useNotifications();

  // Determinar estado de la ruta del conductor
  const hasRouteConfigured = !!driverRoute && (driverRoute.meetingPoints || []).length > 0;
  const routeStateText = hasRouteConfigured
    ? 'Ruta configurada'
    : 'Puntos de encuentro pendientes de configuración';

  const handleItemPress = (screen: AppNavScreen) => {
    onClose();
    onNavigate(screen);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        {/* Fondo oscuro para cerrar al tocar fuera */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* Panel lateral */}
        <View style={styles.drawerPanel}>
          {/* Cabecera del Usuario */}
          <View style={styles.drawerHeader}>
            <View style={styles.avatarCircle}>
              <MaterialCommunityIcons
                name={currentUser.userType === 'alumno' ? 'school' : 'account-tie'}
                size={28}
                color={THEME.colors.textInverse}
              />
            </View>
            <View style={styles.userCol}>
              <Text style={styles.userName} numberOfLines={1}>
                {currentUser.fullName}
              </Text>
              <Text style={styles.userRole}>
                {currentUser.userType === 'alumno' ? 'Alumno Verificado' : 'Docente Verificado'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textInverse} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent}>
            {/* Sección: Navegación General */}
            <Text style={styles.sectionHeader}>Principal</Text>

            <TouchableOpacity
              style={[styles.menuItem, currentScreen === 'home' && styles.menuItemActive]}
              onPress={() => handleItemPress('home')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="view-dashboard-outline"
                size={22}
                color={currentScreen === 'home' ? THEME.colors.primary : THEME.colors.textSecondary}
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'home' && styles.menuItemTextActive,
                ]}
              >
                Inicio y Eco-Impacto
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'passenger_search' && styles.menuItemActive,
              ]}
              onPress={() => handleItemPress('passenger_search')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="magnify"
                size={22}
                color={
                  currentScreen === 'passenger_search'
                    ? THEME.colors.primary
                    : THEME.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'passenger_search' && styles.menuItemTextActive,
                ]}
              >
                Buscar Viajes (Pasajero)
              </Text>
              <SectionBadge count={badges.search.count} variant="inline" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, currentScreen === 'my_trips' && styles.menuItemActive]}
              onPress={() => handleItemPress('my_trips')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="calendar-clock-outline"
                size={22}
                color={currentScreen === 'my_trips' ? THEME.colors.primary : THEME.colors.textSecondary}
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'my_trips' && styles.menuItemTextActive,
                ]}
              >
                Mis Viajes (Historial)
              </Text>
              <SectionBadge count={badges.myTrips.count} critical={badges.myTrips.critical} variant="inline" />
            </TouchableOpacity>

            {/* SECCIÓN CONDUCTOR */}
            <Text style={styles.sectionHeader}>Módulo Conductor</Text>

            {/* ELEMENTO OBLIGATORIO DESTACADO EN COLOR GUINDA (Módulo 8) */}
            <TouchableOpacity
              style={[
                styles.menuItemRouteFeatured,
                (currentScreen === 'driver_route' || currentScreen === 'driver_test_route') &&
                  styles.menuItemRouteFeaturedActive,
              ]}
              onPress={() => handleItemPress(driverRoute ? 'driver_test_route' : 'driver_route')}
              activeOpacity={0.8}
            >
              <View style={styles.routeFeaturedHeader}>
                <View style={styles.routeFeaturedTitleRow}>
                  <MaterialCommunityIcons name="routes" size={22} color={THEME.colors.textInverse} />
                  <Text style={styles.routeFeaturedTitle}>Ruta Actual (Conductor)</Text>
                </View>

                {/* Badge de estado obligatorio (Módulo 8) */}
                <View
                  style={[
                    styles.routeStatusBadge,
                    hasRouteConfigured
                      ? styles.routeStatusConfigured
                      : styles.routeStatusPending,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={hasRouteConfigured ? 'check-circle' : 'alert-circle'}
                    size={12}
                    color={hasRouteConfigured ? THEME.colors.success : THEME.colors.warning}
                  />
                  <Text
                    style={[
                      styles.routeStatusText,
                      hasRouteConfigured
                        ? { color: THEME.colors.success }
                        : { color: THEME.colors.warning },
                    ]}
                  >
                    {routeStateText}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'publish_trip' && styles.menuItemActive,
              ]}
              onPress={() => handleItemPress('publish_trip')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={22}
                color={
                  currentScreen === 'publish_trip'
                    ? THEME.colors.primary
                    : THEME.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'publish_trip' && styles.menuItemTextActive,
                ]}
              >
                Registrar Viaje
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'driver_requests' && styles.menuItemActive,
              ]}
              onPress={() => handleItemPress('driver_requests')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="account-clock-outline"
                size={22}
                color={
                  currentScreen === 'driver_requests'
                    ? THEME.colors.primary
                    : THEME.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'driver_requests' && styles.menuItemTextActive,
                ]}
              >
                Solicitudes de Pasajeros
              </Text>
              <SectionBadge count={badges.requests.count} variant="inline" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'driver_profile_vehicle' && styles.menuItemActive,
              ]}
              onPress={() => handleItemPress('driver_profile_vehicle')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="car-cog"
                size={22}
                color={
                  currentScreen === 'driver_profile_vehicle'
                    ? THEME.colors.primary
                    : THEME.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'driver_profile_vehicle' && styles.menuItemTextActive,
                ]}
              >
                Mi Vehículo y Fotografía
              </Text>
            </TouchableOpacity>

            {/* SECCIÓN PREFERENCIAS */}
            <Text style={styles.sectionHeader}>Cuenta y Alertas</Text>

            <TouchableOpacity
              style={[
                styles.menuItem,
                currentScreen === 'notifications' && styles.menuItemActive,
              ]}
              onPress={() => handleItemPress('notifications')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="bell-outline"
                size={22}
                color={
                  currentScreen === 'notifications'
                    ? THEME.colors.primary
                    : THEME.colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.menuItemText,
                  currentScreen === 'notifications' && styles.menuItemTextActive,
                ]}
              >
                Notificaciones (72h)
              </Text>
              <SectionBadge
                count={unreadNotifs}
                critical={badges.myTrips.critical}
                variant="inline"
              />
            </TouchableOpacity>

            {/* CERRAR SESIÓN */}
            <TouchableOpacity
              style={styles.logoutItem}
              onPress={() => {
                onClose();
                onLogout();
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="logout" size={20} color={THEME.colors.error} />
              <Text style={styles.logoutItemText}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawerPanel: {
    width: 320,
    maxWidth: '85%',
    backgroundColor: THEME.colors.surface,
    height: '100%',
    ...THEME.shadows.hover,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingTop: 40,
    paddingBottom: 20,
    paddingHorizontal: 16,
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userCol: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textInverse,
  },
  userRole: {
    fontSize: 11,
    color: THEME.colors.accent,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
  },
  menuScroll: {
    flex: 1,
  },
  menuContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.md,
    gap: 12,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: THEME.colors.primarySoft,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    flex: 1,
  },
  menuItemTextActive: {
    color: THEME.colors.primary,
  },
  notifBadge: {
    backgroundColor: THEME.colors.accent,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  // ESTILO OBLIGATORIO DESTACADO EN COLOR GUINDA (Módulo 8)
  menuItemRouteFeatured: {
    backgroundColor: THEME.colors.primary, // Guinda institucional #6B1736
    borderRadius: THEME.borderRadius.lg,
    padding: 14,
    marginBottom: 8,
    marginTop: 4,
    ...THEME.shadows.card,
    borderWidth: 1.5,
    borderColor: THEME.colors.accent,
  },
  menuItemRouteFeaturedActive: {
    borderColor: '#FFFFFF',
  },
  routeFeaturedHeader: {
    gap: 8,
  },
  routeFeaturedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeFeaturedTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textInverse,
  },
  routeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.sm,
    gap: 6,
    alignSelf: 'flex-start',
  },
  routeStatusConfigured: {
    backgroundColor: 'rgba(21, 128, 61, 0.15)',
  },
  routeStatusPending: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
  },
  routeStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  logoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.md,
    gap: 12,
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  logoutItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.error,
  },
});
