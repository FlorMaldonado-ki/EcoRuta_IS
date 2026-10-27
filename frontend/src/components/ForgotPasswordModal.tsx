import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { InputField } from './InputField';
import { INSTITUTIONAL_DOMAIN } from '../constants/options';
import { THEME } from '../constants/theme';
import { forgotPassword } from '../services/authService';

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  visible,
  onClose,
}) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Ingresa tu correo institucional.');
      return;
    }
    if (!trimmed.endsWith(INSTITUTIONAL_DOMAIN)) {
      setError(`El correo debe pertenecer al dominio ${INSTITUTIONAL_DOMAIN}`);
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      // POST /api/auth/forgot-password (responde igual exista o no la cuenta)
      await forgotPassword(trimmed);
      setIsSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setEmail('');
    setError(undefined);
    setIsSent(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleReset}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.cardContainer}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="lock-reset" size={24} color={THEME.colors.primary} />
              <Text style={styles.title}>Recuperar Contraseña</Text>
            </View>
            <TouchableOpacity onPress={handleReset} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={THEME.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {!isSent ? (
              <>
                <Text style={styles.description}>
                  Ingresa tu correo institucional. Te enviaremos un enlace temporal con vigencia limitada para restablecer tu contraseña (RF-04).
                </Text>

                <InputField
                  label="Correo institucional"
                  placeholder="ejemplo@morelia.tecnm.mx"
                  iconName="email-outline"
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (error) setError(undefined);
                  }}
                  error={error}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                  onPress={handleSend}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={THEME.colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Enviar enlace de recuperación</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.sentContainer}>
                <View style={styles.checkCircle}>
                  <MaterialCommunityIcons name="email-check" size={38} color={THEME.colors.success} />
                </View>
                <Text style={styles.sentTitle}>¡Correo Enviado!</Text>
                <Text style={styles.sentSubtitle}>
                  Si el correo está registrado, te enviamos un enlace (vigente 1 hora) a:{'\n'}
                  <Text style={styles.emailHighlight}>{email}</Text>{'\n'}
                  Ábrelo, crea tu contraseña nueva y vuelve a iniciar sesión.
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleReset}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Entendido</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
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
    maxWidth: 440,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
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
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  description: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: THEME.colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  sentContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  sentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  sentSubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emailHighlight: {
    fontWeight: '700',
    color: THEME.colors.primary,
  },
});
