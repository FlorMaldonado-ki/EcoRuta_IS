import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { NotificationBell } from '../components/NotificationBell';
import { NavigationDrawer, AppNavScreen } from '../components/NavigationDrawer';
import { NotificationsCenterModal } from './NotificationsCenterModal';
import { PassengerSearchScreen } from './PassengerSearchScreen';
import { TripDetailScreen } from './TripDetailScreen';
import { DriverProfileVehicleScreen } from './DriverProfileVehicleScreen';
import { DriverRouteSetupScreen } from './DriverRouteSetupScreen';
import { DriverTestRouteScreen } from './DriverTestRouteScreen';
import { PublishTripScreen } from './PublishTripScreen';
import { DriverRequestsScreen } from './DriverRequestsScreen';
import { MyTripsScreen } from './MyTripsScreen';
import { THEME } from '../constants/theme';
import { getCommunityImpact, getMyImpact } from '../services/catalogService';
import { getNotifications, getUnreadNotificationCount, getDriverRoute } from '../services/tripStorage';
import type { CommunityImpactDTO, MyImpactDTO, UserDTO, TripDTO, DriverRoute } from '../types/api';

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
  | 'my_trips';

const formatKg = (kg: number) =>
  `${kg.toLocaleString('es-MX', { maximumFractionDigits: kg < 100 ? 2 : 0 })} kg`;

export const AuthenticatedHomeScreen: React.FC<AuthenticatedHomeScreenProps> = ({
  user,
  onLogout,
}) => {
  const isAlumno = user.userType === 'alumno';
  const [community, setCommunity] = useState<CommunityImpactDTO | null>(null);
  const [mine, setMine] = useState<MyImpactDTO | null>(null);
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('home');
  const [selectedTrip, setSelectedTrip] = useState<TripDTO | null>(null);
  const [currentRoute, setCurrentRoute] = useState<DriverRoute | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getCommunityImpact().then(setCommunity).catch(() => setCommunity(null));
    getMyImpact().then(setMine).catch(() => setMine(null));
  }, []);

  // Refresca badge de notificaciones cada vez que vuelve al home
  useEffect(() => {
    if (activeScreen === 'home') {
      setUnreadCount(getUnreadNotificationCount());
    }
  }, [activeScreen]);

  const navigate = (screen: ActiveScreen) => {
    setActiveScreen(screen);
    setDrawerOpen(false);
  };

  const handleDrawerNavigate = (screen: AppNavScreen) => {
    if (screen === 'notifications') {
      setNotificationsOpen(true);
      setDrawerOpen(false);
      return;
    }
    // map drawer keys to internal screens
    const map: Partial<Record<AppNavScreen, ActiveScreen>> = {
      home: 'home',
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

  // ── Pantallas del Sprint 2 ─────────────────────────────────────────────
  if (activeScreen === 'passenger_search') {
    return (
      <PassengerSearchScreen
        currentUser={user}
        onBackToHome={goHome}
        onSelectTrip={(trip) => {
          setSelectedTrip(trip);
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
        onBack={() => navigate('passenger_search')}
        onTripUpdated={(updatedTrip) => setSelectedTrip(updatedTrip)}
      />
    );
  }

  if (activeScreen === 'driver_profile_vehicle') {
    return (
      <DriverProfileVehicleScreen
        currentUser={user}
        onBack={goHome}
        onSuccessNavigateToRoute={() => navigate('driver_route_setup')}
      />
    );
  }

  if (activeScreen === 'driver_route_setup') {
    return (
      <DriverRouteSetupScreen
        currentUser={user}
        onBack={() => navigate('driver_profile_vehicle')}
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
        onGoToRouteSetup={() => navigate('driver_route_setup')}
        onSuccessPublished={goHome}
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
          setActiveScreen('trip_detail');
        }}
        onGoToRequests={() => navigate('driver_requests')}
        onGoToPublishTrip={() => navigate('publish_trip')}
      />
    );
  }

  // ── Dashboard principal ────────────────────────────────────────────────
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

      <NotificationsCenterModal
        visible={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          setUnreadCount(getUnreadNotificationCount());
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Header
          subtitle="TecNM Campus Morelia"
          onOpenMenu={() => setDrawerOpen(true)}
          rightElement={
            <NotificationBell
              unreadCount={unreadCount}
              onPress={() => setNotificationsOpen(true)}
            />
          }
        />

        <View style={styles.body}>
          {/* Banner de Bienvenida */}
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

          {/* Impacto ecológico comunitario */}
          <View style={styles.impactCard}>
            <View style={styles.impactHeader}>
              <MaterialCommunityIcons name="leaf" size={22} color={THEME.colors.accent} />
              <Text style={styles.impactTitle}>Impacto Ecológico Comunitario</Text>
            </View>
            <Text style={styles.impactNumber}>
              {community ? formatKg(community.co2SavedKg) : '—'}
            </Text>
            <Text style={styles.impactSubtitle}>
              de CO₂ ahorrado por la comunidad del TecNM
              {community ? ` · ${community.sharedTrips} viajes compartidos` : ''}
            </Text>
            {mine ? (
              <Text style={styles.impactSubtitle}>
                Tú: {formatKg(mine.co2TodayKg)} hoy · {formatKg(mine.co2TotalKg)} en total
              </Text>
            ) : null}
          </View>

          {/* ── Módulo Pasajero ── */}
          <Text style={styles.sectionTitle}>Módulo Pasajero</Text>

          <View style={styles.quickGrid}>
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigate('passenger_search')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="magnify" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Buscar Viajes</Text>
              <Text style={styles.quickCardSub}>Consulta viajes disponibles</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => navigate('my_trips')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="calendar-check" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Mis Viajes</Text>
              <Text style={styles.quickCardSub}>Reservaciones y viajes activos</Text>
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
              style={styles.quickCard}
              onPress={() => navigate('driver_requests')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="account-multiple-check" size={28} color={THEME.colors.primary} />
              <Text style={styles.quickCardTitle}>Solicitudes</Text>
              <Text style={styles.quickCardSub}>Gestiona pasajeros</Text>
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

          {/* Cerrar sesión */}
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
  },
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
