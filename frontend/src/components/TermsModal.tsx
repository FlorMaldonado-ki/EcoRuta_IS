import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({
  visible,
  onClose,
  onAccept,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerTitleBox}>
              <MaterialCommunityIcons name="file-document-outline" size={24} color={THEME.colors.primary} />
              <View>
                <Text style={styles.title}>Términos y Aviso de Privacidad</Text>
                <Text style={styles.subtitle}>EcoRuta Escolar · TecNM Campus Morelia</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionHeader}>1. Propósito y Carácter Comunitario</Text>
            <Text style={styles.paragraph}>
              EcoRuta Escolar es una plataforma sin fines de lucro diseñada para facilitar la coordinación de viajes compartidos (carpooling) entre estudiantes, docentes y personal activo del Instituto Tecnológico de Morelia (TecNM Campus Morelia). Su objetivo primordial es disminuir la huella de carbono institucional y fomentar una movilidad colaborativa y segura.
            </Text>

            <Text style={styles.sectionHeader}>2. Requisitos de Elegibilidad y Verificación</Text>
            <Text style={styles.paragraph}>
              El acceso al servicio está restringido exclusivamente a miembros de la comunidad con correo electrónico institucional activo con dominio @morelia.tecnm.mx. Es requisito indispensable validar el estatus académico adjuntando la retícula vigente (para alumnos) o la carga de materias/horario del semestre en curso (para docentes).
            </Text>

            <Text style={styles.sectionHeader}>3. Aviso de Privacidad y Protección de Datos</Text>
            <Text style={styles.paragraph}>
              En cumplimiento con la normativa aplicable de protección de datos personales, la información proporcionada (nombre, carrera o departamento, vehículo y documentación adjunta) se utilizará únicamente con fines de verificación de identidad, seguridad y cálculo del impacto ambiental de CO₂ ahorrado. No se comercializará ni transferirá a terceros.
            </Text>

            <Text style={styles.sectionHeader}>4. Responsabilidad y Acuerdos de Viaje</Text>
            <Text style={styles.paragraph}>
              La plataforma actúa como punto de encuentro digital. EcoRuta Escolar no gestiona transacciones monetarias ni asume responsabilidad civil por siniestros o acuerdos particulares entre conductores y pasajeros. Los conductores declaran bajo protesta de decir verdad que cuentan con licencia de conducir y póliza de seguro vehicular vigentes.
            </Text>

            <Text style={styles.sectionHeader}>5. Código de Conducta Institucional</Text>
            <Text style={styles.paragraph}>
              Los usuarios se comprometen a mantener un trato respetuoso, puntual y alineado con los valores del TecNM. Conductas inapropiadas, reportes reiterados o falsificación de documentos resultarán en la suspensión definitiva de la cuenta en la plataforma.
            </Text>

            <View style={styles.badgeBox}>
              <MaterialCommunityIcons name="shield-check" size={20} color={THEME.colors.accentDark} />
              <Text style={styles.badgeText}>
                Al continuar, confirmas que has leído y aceptas conducirte bajo estos lineamientos institucionales.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cerrar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => {
                onAccept();
                onClose();
              }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="check" size={18} color={THEME.colors.textInverse} />
              <Text style={styles.acceptBtnText}>Aceptar términos</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
    ...THEME.shadows.hover,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceAlt,
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.colors.primary,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
  },
  content: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 18,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.primary,
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 19,
    marginBottom: 10,
    textAlign: 'justify',
  },
  badgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.warningBg,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginTop: 14,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.35)',
  },
  badgeText: {
    fontSize: 12,
    color: '#78350F',
    flex: 1,
    lineHeight: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    gap: 12,
    backgroundColor: THEME.colors.surface,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.md,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: THEME.borderRadius.md,
    gap: 8,
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textInverse,
  },
});
