import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { THEME } from '../constants/theme';
import { getCommunityImpact, getMyImpact } from '../services/catalogService';
import type { CommunityImpactDTO, MyImpactDTO, UserDTO } from '../types/api';

interface AuthenticatedHomeScreenProps {
  user: UserDTO;
  onLogout: () => void;
}

const formatKg = (kg: number) =>
  `${kg.toLocaleString('es-MX', { maximumFractionDigits: kg < 100 ? 2 : 0 })} kg`;

export const AuthenticatedHomeScreen: React.FC<AuthenticatedHomeScreenProps> = ({
  user,
  onLogout,
}) => {
  // userType = alumno/maestro. (user.role es el rol de seguridad: user/admin)
  const isAlumno = user.userType === 'alumno';
  const [community, setCommunity] = useState<CommunityImpactDTO | null>(null);
  const [mine, setMine] = useState<MyImpactDTO | null>(null);

  useEffect(() => {
    // RF-24 (comunidad) y RF-23 (usuario): datos reales de la vista v_co2_* en Neon.
    getCommunityImpact().then(setCommunity).catch(() => setCommunity(null));
    getMyImpact().then(setMine).catch(() => setMine(null));
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header subtitle="TecNM Campus Morelia" />

      <View style={styles.body}>
        {/* Banner de Bienvenida con sesión activa */}
        <View style={styles.welcomeCard}>
          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons
              name={isAlumno ? 'school' : 'account-tie'}
              size={36}
              color={THEME.colors.primary}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.welcomeLabel}>Sesión activa (RF-03)</Text>
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

        {/* Tarjeta de impacto ambiental Eco-Calculator comunitaria (RF-24) */}
        <View style={styles.impactCard}>
          <View style={styles.impactHeader}>
            <MaterialCommunityIcons name="leaf" size={22} color={THEME.colors.accent} />
            <Text style={styles.impactTitle}>Impacto Ecológico Comunitario</Text>
          </View>
          <Text style={styles.impactNumber}>{community ? formatKg(community.co2SavedKg) : '—'}</Text>
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

        {/* Botón de cierre de sesión */}
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
});
