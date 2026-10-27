import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { InputField } from '../components/InputField';
import { ForgotPasswordModal } from '../components/ForgotPasswordModal';
import { INSTITUTIONAL_DOMAIN } from '../constants/options';
import { THEME } from '../constants/theme';
import { login, resendVerification } from '../services/authService';
import { ApiError } from '../services/apiClient';
import { confirmAction, notify } from '../utils/notify';
import type { Session } from '../types/api';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  onLoginSuccess: (session: Session) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToRegister,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const validate = (): boolean => {
    let valid = true;
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setEmailError('El correo institucional es obligatorio.');
      valid = false;
    } else if (!trimmedEmail.endsWith(INSTITUTIONAL_DOMAIN)) {
      setEmailError(`Solo se admiten correos institucionales del dominio ${INSTITUTIONAL_DOMAIN}`);
      valid = false;
    } else {
      setEmailError(undefined);
    }

    if (!password) {
      setPasswordError('La contraseña es obligatoria.');
      valid = false;
    } else if (password.length < 8) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres.');
      valid = false;
    } else {
      setPasswordError(undefined);
    }

    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      // POST /api/auth/login → { token, user }
      const session = await login(email, password);
      onLoginSuccess(session);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        notify('Error', (err as Error).message);
        return;
      }
      if (err.code === 'CORREO_NO_VERIFICADO') {
        confirmAction('Correo sin verificar', err.message, 'Reenviar enlace', async () => {
          try {
            const r = await resendVerification(email);
            notify('Enlace enviado', r.message);
          } catch (e) {
            notify('No se pudo reenviar', (e as Error).message);
          }
        });
      } else if (err.fields) {
        setEmailError(err.fields.email);
        setPasswordError(err.fields.password);
      } else if (err.code === 'CREDENCIALES_INVALIDAS') {
        setPasswordError(err.message);
      } else {
        notify('No se pudo iniciar sesión', err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Cuentas demo del seed (backend/db/seeds/001_demo.sql). Solo en desarrollo.
  const handleQuickFill = (role: 'alumno' | 'maestro') => {
    setEmail(role === 'alumno' ? 'demo.ana@morelia.tecnm.mx' : 'demo.luis@morelia.tecnm.mx');
    setPassword('Demo1234');
    setEmailError(undefined);
    setPasswordError(undefined);
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Header subtitle="TecNM Campus Morelia" />

        <View style={styles.contentWrapper}>
          <View style={styles.card}>
            {/* Título y Bienvenida */}
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="account-lock-outline" size={32} color={THEME.colors.primary} />
              </View>
              <Text style={styles.title}>Iniciar Sesión</Text>
              <Text style={styles.subtitle}>
                Accede con tu cuenta institucional para coordinar y compartir rutas escolares.
              </Text>
            </View>

            {/* Campos de acceso */}
            <InputField
              label="Correo institucional"
              placeholder="ejemplo@morelia.tecnm.mx"
              iconName="email-outline"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (emailError) setEmailError(undefined);
              }}
              error={emailError}
              helperText={`Dominio obligatorio: ${INSTITUTIONAL_DOMAIN}`}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <InputField
              label="Contraseña"
              placeholder="Ingresa tu contraseña"
              iconName="lock-outline"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError(undefined);
              }}
              error={passwordError}
              isPassword
            />

            {/* Enlace Recuperar Contraseña */}
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => setShowForgotModal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotBtnText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            {/* Botón Principal de Iniciar Sesión */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión en EcoRuta"
            >
              {isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={THEME.colors.textInverse} size="small" />
                  <Text style={styles.submitButtonText}>Iniciando sesión...</Text>
                </View>
              ) : (
                <View style={styles.loadingRow}>
                  <MaterialCommunityIcons name="login" size={20} color={THEME.colors.textInverse} />
                  <Text style={styles.submitButtonText}>Iniciar Sesión</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Atajos de prueba (cuentas del seed). Solo en desarrollo: no aparecen en el APK de producción. */}
            {__DEV__ && (
            <View style={styles.quickFillSection}>
              <Text style={styles.quickFillLabel}>Cuentas demo (seed):</Text>
              <View style={styles.quickButtonsRow}>
                <TouchableOpacity
                  style={styles.quickBtn}
                  onPress={() => handleQuickFill('alumno')}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="school" size={14} color={THEME.colors.primary} />
                  <Text style={styles.quickBtnText}>Cuenta Alumno</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickBtn}
                  onPress={() => handleQuickFill('maestro')}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="account-tie" size={14} color={THEME.colors.primary} />
                  <Text style={styles.quickBtnText}>Cuenta Maestro</Text>
                </TouchableOpacity>
              </View>
            </View>
            )}

            {/* Enlace de navegación hacia Registro */}
            <View style={styles.registerPrompt}>
              <Text style={styles.registerPromptText}>¿Aún no tienes cuenta? </Text>
              <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.7}>
                <Text style={styles.registerPromptLink}>Regístrate aquí</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Modal de Recuperación de Contraseña */}
        <ForgotPasswordModal
          visible={showForgotModal}
          onClose={() => setShowForgotModal(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  contentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 24,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(197, 155, 39, 0.35)',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 18,
    paddingVertical: 4,
  },
  forgotBtnText: {
    fontSize: 13,
    color: THEME.colors.primary,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...THEME.shadows.hover,
  },
  btnDisabled: {
    opacity: 0.75,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: THEME.colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  quickFillSection: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  quickFillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  quickButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: THEME.borderRadius.sm,
  },
  quickBtnText: {
    fontSize: 12,
    color: THEME.colors.primary,
    fontWeight: '600',
  },
  registerPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  registerPromptText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  registerPromptLink: {
    fontSize: 13,
    color: THEME.colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
