import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { UserType } from '../types/registration';
import { THEME } from '../constants/theme';

interface UserTypeSelectorProps {
  selectedType: UserType | null;
  onSelect: (type: UserType) => void;
  error?: string;
}

export const UserTypeSelector: React.FC<UserTypeSelectorProps> = ({
  selectedType,
  onSelect,
  error,
}) => {
  const isAlumno = selectedType === 'alumno';
  const isMaestro = selectedType === 'maestro';

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.sectionTitle}>
          Tipo de usuario <Text style={styles.requiredMark}>*</Text>
        </Text>
        <Text style={styles.subHint}>Selecciona tu rol en la institución</Text>
      </View>

      <View style={styles.optionsRow}>
        {/* Opción Alumno */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onSelect('alumno')}
          style={[
            styles.card,
            isAlumno && styles.cardSelected,
            error && !selectedType && styles.cardError,
          ]}
          accessibilityRole="radio"
          accessibilityState={{ checked: isAlumno }}
          accessibilityLabel="Seleccionar tipo de usuario: Alumno"
        >
          <View style={styles.cardHeader}>
            <View style={[styles.radioCircle, isAlumno && styles.radioCircleSelected]}>
              {isAlumno && <View style={styles.radioDot} />}
            </View>
            <View style={[styles.iconCircle, isAlumno && styles.iconCircleSelected]}>
              <MaterialCommunityIcons
                name="school"
                size={22}
                color={isAlumno ? THEME.colors.primary : THEME.colors.textSecondary}
              />
            </View>
          </View>

          <Text style={[styles.cardTitle, isAlumno && styles.cardTitleSelected]}>
            Alumno
          </Text>
          <Text style={styles.cardDescription}>
            Estudiante activo con retícula académica vigente.
          </Text>

          {isAlumno && (
            <View style={styles.activeTag}>
              <MaterialCommunityIcons name="check" size={12} color={THEME.colors.primary} />
              <Text style={styles.activeTagText}>Seleccionado</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Opción Maestro */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onSelect('maestro')}
          style={[
            styles.card,
            isMaestro && styles.cardSelected,
            error && !selectedType && styles.cardError,
          ]}
          accessibilityRole="radio"
          accessibilityState={{ checked: isMaestro }}
          accessibilityLabel="Seleccionar tipo de usuario: Maestro"
        >
          <View style={styles.cardHeader}>
            <View style={[styles.radioCircle, isMaestro && styles.radioCircleSelected]}>
              {isMaestro && <View style={styles.radioDot} />}
            </View>
            <View style={[styles.iconCircle, isMaestro && styles.iconCircleSelected]}>
              <MaterialCommunityIcons
                name="account-tie"
                size={22}
                color={isMaestro ? THEME.colors.primary : THEME.colors.textSecondary}
              />
            </View>
          </View>

          <Text style={[styles.cardTitle, isMaestro && styles.cardTitleSelected]}>
            Maestro
          </Text>
          <Text style={styles.cardDescription}>
            Docente o personal con carga horaria del semestre actual.
          </Text>

          {isMaestro && (
            <View style={styles.activeTag}>
              <MaterialCommunityIcons name="check" size={12} color={THEME.colors.primary} />
              <Text style={styles.activeTagText}>Seleccionado</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={THEME.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  labelRow: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  requiredMark: {
    color: THEME.colors.error,
  },
  subHint: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  card: {
    flex: 1,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    minHeight: 145,
    justifyContent: 'space-between',
    ...THEME.shadows.card,
  },
  cardSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primarySoft,
    borderWidth: 2,
  },
  cardError: {
    borderColor: THEME.colors.errorBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: THEME.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
  },
  radioCircleSelected: {
    borderColor: THEME.colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.colors.accent,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSelected: {
    backgroundColor: '#FFFFFF',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 4,
  },
  cardTitleSelected: {
    color: THEME.colors.primary,
  },
  cardDescription: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 15,
    marginTop: 4,
    flexGrow: 1,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
    marginTop: 8,
    borderWidth: 1,
    borderColor: THEME.colors.primaryLight,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.error,
    fontWeight: '500',
  },
});
