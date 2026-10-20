import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { THEME } from '../constants/theme';

interface AuthenticatedHomeScreenProps {
  user: {
    name: string;
    email: string;
    role: 'alumno' | 'maestro';
  };
  onLogout: () => void;
}

export const AuthenticatedHomeScreen: React.FC<AuthenticatedHomeScreenProps> = ({
  user,
  onLogout,
}) => {
  const isAlumno = user.role === 'alumno';

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
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
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
          <Text style={styles.impactNumber}>12,450 kg</Text>
          <Text style={styles.impactSubtitle}>de CO₂ ahorrado por la comunidad del TecNM</Text>
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
