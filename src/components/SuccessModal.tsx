import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RegistrationFormData } from '../types/registration';
import { THEME } from '../constants/theme';

interface SuccessModalProps {
  visible: boolean;
  data: RegistrationFormData;
  onReset: () => void;
  onDismiss: () => void;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({
  visible,
  data,
  onReset,
  onDismiss,
}) => {
  const isAlumno = data.userType === 'alumno';
  const doc = isAlumno ? data.academicCurriculumDoc : data.scheduleDoc;
  const docLabel = isAlumno ? 'Retícula académica vigente' : 'Carga de materias / Horario';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.cardContainer}>
          <ScrollView contentContainerStyle={styles.content}>
            {/* Success icon badge */}
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="check-decagram" size={48} color={THEME.colors.primary} />
            </View>

            <Text style={styles.title}>¡Registro Exitoso!</Text>
            <Text style={styles.subtitle}>
              Tu solicitud de cuenta en EcoRuta Escolar ha sido procesada correctamente en este Sprint 1 (Frontend).
            </Text>

            {/* Email notice box matching ERS RF-02 */}
            <View style={styles.emailNoticeBox}>
              <MaterialCommunityIcons name="email-check-outline" size={22} color={THEME.colors.primary} />
              <View style={styles.emailNoticeTextWrapper}>
                <Text style={styles.emailNoticeTitle}>Enlace de verificación enviado</Text>
                <Text style={styles.emailNoticeSubtitle}>
                  Se simuló el envío a: <Text style={styles.emailBold}>{data.email}</Text>. (Vigencia 24 horas según ERS RF-02).
                </Text>
              </View>
            </View>

            {/* Resumen de datos registrados */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Resumen de registro:</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tipo de usuario:</Text>
                <View style={styles.userTypeBadge}>
                  <MaterialCommunityIcons
                    name={isAlumno ? 'school' : 'account-tie'}
                    size={14}
                    color={THEME.colors.primary}
                  />
                  <Text style={styles.userTypeText}>
                    {isAlumno ? 'Alumno' : 'Maestro'}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Nombre:</Text>
                <Text style={styles.summaryValue}>{data.fullName}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {isAlumno ? 'Carrera:' : 'Departamento:'}
                </Text>
                <Text style={styles.summaryValue}>
                  {isAlumno ? data.career : data.department}
                </Text>
              </View>

              <View style={[styles.summaryRow, styles.summaryRowLast]}>
                <Text style={styles.summaryLabel}>Documento:</Text>
                <View style={styles.docInfoBox}>
                  <MaterialCommunityIcons
                    name="file-check-outline"
                    size={16}
                    color={THEME.colors.success}
                  />
                  <Text style={styles.docName} numberOfLines={1}>
                    {doc?.name || 'Documento adjunto'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Status note */}
            <View style={styles.footerNote}>
              <MaterialCommunityIcons name="information" size={16} color={THEME.colors.accentDark} />
              <Text style={styles.footerNoteText}>
                Documento validado localmente en frontend. Listo para integración con backend en Sprint 2.
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={onDismiss}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Continuar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onReset}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="refresh" size={16} color={THEME.colors.primary} />
                <Text style={styles.secondaryBtnText}>Nuevo registro de prueba</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: THEME.colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    ...THEME.shadows.hover,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: THEME.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(197, 155, 39, 0.4)',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emailNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySoft,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(107, 23, 54, 0.2)',
    gap: 12,
  },
  emailNoticeTextWrapper: {
    flex: 1,
  },
  emailNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  emailNoticeSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  emailBold: {
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  summaryLabel: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  userTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    gap: 4,
  },
  userTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  docInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '60%',
  },
  docName: {
    fontSize: 12,
    color: THEME.colors.success,
    fontWeight: '600',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.warningBg,
    padding: 10,
    borderRadius: THEME.borderRadius.md,
    width: '100%',
    gap: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.3)',
  },
  footerNoteText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
    lineHeight: 15,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 14,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textInverse,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 6,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.primary,
  },
});
