import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { NotificationBell } from '../components/NotificationBell';
import { NavigationDrawer, AppNavScreen } from '../components/NavigationDrawer';
import { PassengerSearchScreen } from './PassengerSearchScreen';
import { TripDetailScreen } from './TripDetailScreen';
import { DriverProfileVehicleScreen } from './DriverProfileVehicleScreen';
import { DriverRouteSetupScreen } from './DriverRouteSetupScreen';
import { DriverTestRouteScreen } from './DriverTestRouteScreen';
import { PublishTripScreen } from './PublishTripScreen';
import { DriverRequestsScreen } from './DriverRequestsScreen';
import { MyTripsScreen } from './MyTripsScreen';
import { MyImpactScreen } from './MyImpactScreen';
import { THEME } from '../constants/theme';
import { getDriverRoute } from '../services/tripStorage';
import { useImpact } from '../hooks/useImpact';
import { formatKg, formatKm } from '../utils/format';
import { useNotifications, type NotifSection } from '../hooks/useNotifications';
import { SectionBadge } from '../components/SectionBadge';
import type { UserDTO, TripDTO, DriverRoute } from '../types/api';

interface AuthenticatedHomeScreenProps {
  user: UserDTO;
  onLogout: () => void;
}

type ActiveScreen =
  | 'home'
  | 'passenger_search'
  | 'trip_detail'
  | 'driver_profile_vehicle'
  | 'driver_route_setup'
  | 'driver_test_route'
  | 'publish_trip'
  | 'driver_requests'
  | 'my_trips'
  | 'my_impact'
  | 'edit_trip';

/** Pantalla a la que lleva cada sección con insignia. */
const SECTION_SCREEN: Record<NotifSection, ActiveScreen> = {
  search: 'passenger_search',
  myTrips: 'my_trips',
  requests: 'driver_requests',
};
const SCREEN_SECTION: Partial<Record<ActiveScreen, NotifSection>> = {
  passenger_search: 'search',
  my_trips: 'myTrips',
  driver_requests: 'requests',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const AuthenticatedHomeScreen: React.FC<AuthenticatedHomeScreenProps> = ({
  user,
  onLogout,
}) => {
  const isAlumno = user.userType === 'alumno';
  const { community, communityStatus, communityError, mine, refresh: refreshImpact } = useImpact();
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('home');
  // Viaje que se está editando y a dónde regresar al terminar
  const [editingTrip, setEditingTrip] = useState<TripDTO | null>(null);
  const [editReturnTo, setEditReturnTo] = useState<ActiveScreen>('my_trips');
  const [selectedTrip, setSelectedTrip] = useState<TripDTO | null>(null);
  // Pantalla a la que regresa el detalle del viaje (búsqueda o mis viajes)
  const [detailReturnTo, setDetailReturnTo] = useState<ActiveScreen>('passenger_search');
  const [currentRoute, setCurrentRoute] = useState<DriverRoute | null>(null);
  const [routeReturnTo, setRouteReturnTo] = useState<ActiveScreen>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unread: unreadCount, openCenter, badges, markSectionSeen, registerNavigator } = useNotifications();

  // Al volver al inicio se refresca el total (la primera carga la hace ImpactProvider).
  const firstHome = useRef(true);
  useEffect(() => {
    if (activeScreen !== 'home') return;
    if (firstHome.current) { firstHome.current = false; return; }
    refreshImpact();
  }, [activeScreen, refreshImpact]);

  const startEditing = (trip: TripDTO, returnTo: ActiveScreen) => {
    setEditingTrip(trip);
    setEditReturnTo(returnTo);
    setActiveScreen('edit_trip');
  };

  const navigate = (screen: ActiveScreen) => {
    setActiveScreen(screen);
    setDrawerOpen(false);
    // Al entrar a una sección su insignia se da por vista.
    const section = SCREEN_SECTION[screen];
    if (section) markSectionSeen(section);
  };

  // Las alertas y la bandeja pueden llevar directo a una sección.
  useEffect(() => {
    registerNavigator((section) => navigate(SECTION_SCREEN[section]));
    return () => registerNavigator(null);
  });

  const handleDrawerNavigate = (screen: AppNavScreen) => {
    if (screen === 'notifications') {
      openCenter();
      setDrawerOpen(false);
      return;
    }
    const map: Partial<Record<AppNavScreen, ActiveScreen>> = {
      home: 'home',
      my_impact: 'my_impact',
      passenger_search: 'passenger_search',
      publish_trip: 'publish_trip',
      driver_route: 'driver_route_setup',
      driver_test_route: 'driver_test_route',
      driver_requests: 'driver_requests',
      my_trips: 'my_trips',
      driver_profile_vehicle: 'driver_profile_vehicle',
    };
    const target = map[screen];
    if (target) navigate(target);
    setDrawerOpen(false);
  };

  const goHome = () => {
    setActiveScreen('home');
    setSelectedTrip(null);
  };

  // ── Subpantallas ────────────────────────────────────────────────
  if (activeScreen === 'passenger_search') {
    return (
      <PassengerSearchScreen
        currentUser={user}
        onBackToHome={goHome}
        onSelectTrip={(trip) => {
          setSelectedTrip(trip);
          setDetailReturnTo('passenger_search');
          setActiveScreen('trip_detail');
        }}
      />
    );
  }

  if (activeScreen === 'trip_detail' && selectedTrip) {
    return (
      <TripDetailScreen
        trip={selectedTrip}
        currentUser={user}
        onBack={() => navigate(detailReturnTo)}
        onTripUpdated={(updatedTrip) => setSelectedTrip(updatedTrip)}
        onEditTrip={(t) => startEditing(t, 'trip_detail')}
      />
    );
  }

  if (activeScreen === 'driver_profile_vehicle') {
    return (
      <DriverProfileVehicleScreen
        currentUser={user}
        onBack={goHome}
        onGoToRouteSetup={() => {
          setRouteReturnTo('driver_profile_vehicle');
          navigate('driver_route_setup');
        }}
      />
    );
  }

  if (activeScreen === 'driver_route_setup') {
    return (
      <DriverRouteSetupScreen
        currentUser={user}
        onBack={() => {
          const target = routeReturnTo;
          setRouteReturnTo('home');
          navigate(target);
        }}
        onContinueToTestRoute={(route) => {
          setCurrentRoute(route);
          navigate('driver_test_route');
        }}
      />
    );
  }

  if (activeScreen === 'driver_test_route') {
    const route = currentRoute ?? getDriverRoute();
    if (!route) {
      // Si no hay ruta, redirige a configurarla
      navigate('driver_route_setup');
      return null;
    }
    return (
      <DriverTestRouteScreen
        currentUser={user}
        route={route}
        onBack={() => navigate('driver_route_setup')}
        onSuccessFinished={() => navigate('publish_trip')}
      />
    );
  }

  if (activeScreen === 'publish_trip') {
    return (
      <PublishTripScreen
        currentUser={user}
        onBack={() => navigate('driver_test_route')}
        onGoToVehicleSetup={() => navigate('driver_profile_vehicle')}
        onGoToRouteSetup={() => {
          setRouteReturnTo('driver_profile_vehicle');
          navigate('driver_route_setup');
        }}
        onSuccessPublished={() => navigate('my_trips')}
      />
    );
  }

  if (activeScreen === 'edit_trip' && editingTrip) {
    return (
      <PublishTripScreen
        currentUser={user}
        editingTrip={editingTrip}
        onBack={() => navigate(editReturnTo)}
        onGoToVehicleSetup={() => navigate('driver_profile_vehicle')}
        onGoToRouteSetup={() => {
          setRouteReturnTo('driver_profile_vehicle');
          navigate('driver_route_setup');
        }}
        onSuccessPublished={() => navigate('my_trips')}
        onSuccessEdited={(updated) => {
          setEditingTrip(null);
          if (editReturnTo === 'trip_detail') setSelectedTrip(updated);
          navigate(editReturnTo);
        }}
      />
    );
  }

  if (activeScreen === 'my_impact') {
    return (
      <MyImpactScreen
        currentUser={user}
        onBack={goHome}
        onGoToSearch={() => navigate('passenger_search')}
      />
    );
  }

  if (activeScreen === 'driver_requests') {
    return (
      <DriverRequestsScreen
        currentUser={user}
        onBack={goHome}
      />
    );
  }

  if (activeScreen === 'my_trips') {
    return (
      <MyTripsScreen
        currentUser={user}
        onBack={goHome}
        onSelectTripDetail={(trip) => {
          setSelectedTrip(trip);
          setDetailReturnTo('my_trips');
          setActiveScreen('trip_detail');
        }}
        onGoToRequests={() => navigate('driver_requests')}
        onGoToPublishTrip={() => navigate('publish_trip')}
        onEditTrip={(t) => startEditing(t, 'my_trips')}
      />
    );
  }

  // ── Dashboard principal ───────────────────────────────────────────────────
  return (
    <>
      <NavigationDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={handleDrawerNavigate}
        currentUser={user}
        currentScreen="home"
        onLogout={onLogout}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Header
          subtitle="TecNM Campus Morelia"
          onOpenMenu={() => setDrawerOpen(true)}
          rightElement={
            <NotificationBell
              unreadCount={unreadCount}
              onPress={openCenter}
            />
          }
        />

        <View style={styles.body}>
          <View style={styles.welcomeCard}>
            <View style={styles.avatarCircle}>
              <MaterialCommunityIcons
                name={isAlumno ? 'school' : 'account-tie'}
                size={36}
                color={THEME.colors.primary}
              />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.welcomeLabel}>Sesión activa</Text>
              <Text style={styles.userName}>{user.fullName}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <Text style={styles.userEmail}>{user.career ?? user.department}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {isAlumno ? '🎓 Alumno Verificado' : '👨‍🏫 Docente Verificado'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.impactCard}>
            <View style={styles.impactHeader}>
              <MaterialCommunityIcons name="leaf" size={22} color={THEME.colors.accent} />
              <Text style={styles.impactTitle}>Impacto Ecológico Comunitario</Text>
            </View>
            {communityStatus === 'loading' && !community ? (
              <ActivityIndicator style={styles.impactLoader} color={THEME.colors.accent} accessibilityLabel="Cargando impacto" />
            ) : communityStatus === 'error' && !community ? (
              <View style={styles.impactErrorBox}>
                <Text style={styles.impactSubtitle}>
                  {communityError ?? 'No pudimos cargar el impacto de la comunidad.'}
                </Text>
                <TouchableOpacity
                  style={styles.impactRetryBtn}
                  onPress={refreshImpact}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="refresh" size={16} color={THEME.colors.primaryDark} />
                  <Text style={styles.impactRetryText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.impactNumber}>{formatKg(community?.co2SavedKg ?? 0)}</Text>
                <Text style={styles.impactSubtitle}>de CO₂ ahorrado por la comunidad del TecNM</Text>
                <View style={styles.impactStatsRow}>
                  <View style={styles.impactStat}>
                    <MaterialCommunityIcons name="car-multiple" size={16} color={THEME.colors.accent} />
                    <Text style={styles.impactStatText}>
                      {plural(community?.sharedTrips ?? 0, 'viaje compartido', 'viajes compartidos')}
                    </Text>
                  </View>
                  <View style={styles.impactStat}>
                    <MaterialCommunityIcons name="road-variant" size={16} color={THEME.colors.accent} />
                    <Text style={styles.impactStatText}>{formatKm(community?.kmAvoided ?? 0)} evitados</Text>
                  </View>
                </View>
              </>
            )}
            {mine ? (
              <TouchableOpacity
                style={styles.impactMineBtn}
                onPress={() => navigate('my_impact')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.impactMineText}>
                  Tú: {formatKg(mine.co2TodayKg)} hoy · {formatKg(mine.co2TotalKg)} en total
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={THEME.colors.accent} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── Módulo Pasajero ── */}
          <Text style={styles.sectionTitle}>Módulo Pasajero</Text>

          <View style={styles.quickGrid}>
            <TouchableOpacity
              style={[styles.quickCard, badges.search.count > 0 && styles.quickCardNotify]}
              onPress={() => navigate('passenger_search')}
              activeOpacity={0.8}
            >
              <SectionBadge count={badges.search.count} />
              <MaterialCommunityIcons name="magnify" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Buscar Viajes</Text>
              {badges.search.count > 0 ? (
                <Text style={[styles.quickCardSub, styles.quickCardSubNotify]}>
                  {plural(badges.search.count, 'viaje nuevo', 'viajes nuevos')}
                </Text>
              ) : (
                <Text style={styles.quickCardSub}>Consulta viajes disponibles</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickCard,
                badges.myTrips.count > 0 && (badges.myTrips.critical ? styles.quickCardCritical : styles.quickCardNotify),
              ]}
              onPress={() => navigate('my_trips')}
              activeOpacity={0.8}
            >
              <SectionBadge count={badges.myTrips.count} critical={badges.myTrips.critical} />
              <MaterialCommunityIcons
                name="calendar-check"
                size={28}
                color={badges.myTrips.critical ? THEME.colors.error : THEME.colors.primary}
              />
              <Text style={styles.quickCardTitle}>Mis Viajes</Text>
              {badges.myTrips.count > 0 ? (
                <Text
                  style={[
                    styles.quickCardSub,
                    badges.myTrips.critical ? styles.quickCardSubCritical : styles.quickCardSubNotify,
                  ]}
                >
                  {badges.myTrips.critical
                    ? plural(badges.myTrips.count, 'aviso importante', 'avisos importantes')
                    : plural(badges.myTrips.count, 'actualización', 'actualizaciones')}
                </Text>
              ) : (
                <Text style={styles.quickCardSub}>Reservaciones y viajes activos</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Módulo Conductor ── */}
          <Text style={styles.sectionTitle}>Módulo Conductor</Text>

          <View style={styles.quickGrid}>
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigate('driver_profile_vehicle')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="card-account-details" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Mi Perfil</Text>
              <Text style={styles.quickCardSub}>Foto y datos del vehículo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigate('publish_trip')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Registrar Viaje</Text>
              <Text style={styles.quickCardSub}>Publica un nuevo viaje</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickCard, badges.requests.count > 0 && styles.quickCardNotify]}
              onPress={() => navigate('driver_requests')}
              activeOpacity={0.8}
            >
              <SectionBadge count={badges.requests.count} />
              <MaterialCommunityIcons name="account-multiple-check" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Solicitudes</Text>
              {badges.requests.count > 0 ? (
                <Text style={[styles.quickCardSub, styles.quickCardSubNotify]}>
                  {plural(badges.requests.count, 'por responder', 'por responder')}
                </Text>
              ) : (
                <Text style={styles.quickCardSub}>Gestiona pasajeros</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickCard, styles.quickCardAccent]}
              onPress={() => navigate('driver_route_setup')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="map-marker-path" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Ruta Actual</Text>
              <Text style={styles.quickCardSub}>Configura tu recorrido</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={onLogout}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
          >
            <MaterialCommunityIcons name="logout" size={18} color={THEME.colors.error} />
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    paddingBottom: 40,
  },
  body: {
    padding: 16,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    padding: 18,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
    marginBottom: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(197, 155, 39, 0.4)',
  },
  userInfo: {
    flex: 1,
  },
  welcomeLabel: {
    fontSize: 11,
    color: THEME.colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: THEME.colors.surfaceAlt,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.primary,
  },
  impactCard: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.lg,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    ...THEME.shadows.hover,
  },
  impactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  impactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.accent,
  },
  impactNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: THEME.colors.textInverse,
    letterSpacing: -0.5,
  },
  impactSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
    textAlign: 'center',
  },
  impactLoader: { marginVertical: 14 },
  impactErrorBox: { alignItems: 'center', gap: 10, marginVertical: 6 },
  impactRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.colors.accent,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  impactRetryText: { fontSize: 13, fontWeight: '800', color: THEME.colors.primaryDark },
  impactStatsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 10 },
  impactStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  impactStatText: { fontSize: 12, fontWeight: '700', color: THEME.colors.textInverse },
  impactMineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  impactMineText: { fontSize: 12, fontWeight: '700', color: THEME.colors.textInverse },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.errorBorder,
    borderRadius: THEME.borderRadius.md,
    height: 48,
    gap: 8,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.error,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  quickCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  quickCardNotify: {
    borderColor: THEME.colors.accent,
    borderWidth: 1.5,
    ...THEME.shadows.hover,
  },
  quickCardCritical: {
    borderColor: THEME.colors.error,
    borderWidth: 1.5,
    backgroundColor: '#FFF7F7',
  },
  quickCardSubNotify: {
    color: THEME.colors.accentDark,
    fontWeight: '800',
  },
  quickCardSubCritical: {
    color: THEME.colors.error,
    fontWeight: '800',
  },
  quickCardAccent: {
    borderColor: THEME.colors.primary,
    borderWidth: 1.5,
    backgroundColor: THEME.colors.primarySoft,
  },
  quickCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  quickCardSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
});
