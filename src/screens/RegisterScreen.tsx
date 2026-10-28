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
import { UserTypeSelector } from '../components/UserTypeSelector';
import { InputField } from '../components/InputField';
import { SelectModalField } from '../components/SelectModalField';
import { DocumentPickerField } from '../components/DocumentPickerField';
import { TermsModal } from '../components/TermsModal';
import { SuccessModal } from '../components/SuccessModal';
import {
  RegistrationFormData,
  UserType,
  FormErrors,
  AttachedFile,
} from '../types/registration';
import {
  TECNM_MORELIA_CAREERS,
  TECNM_MORELIA_DEPARTMENTS,
  INSTITUTIONAL_DOMAIN,
} from '../constants/options';
import { THEME } from '../constants/theme';

const initialFormData: RegistrationFormData = {
  userType: null,
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  termsAccepted: false,
  career: '',
  academicCurriculumDoc: null,
  department: '',
  scheduleDoc: null,
};

interface RegisterScreenProps {
  onNavigateToLogin?: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  const [formData, setFormData] = useState<RegistrationFormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedData, setSubmittedData] = useState<RegistrationFormData>(initialFormData);

  // Manejo de cambio de tipo de usuario
  const handleUserTypeChange = (type: UserType) => {
    setFormData((prev) => ({
      ...prev,
      userType: type,
      // Si cambia de tipo, limpiamos los requisitos del otro tipo
      ...(type === 'alumno'
        ? { department: '', scheduleDoc: null }
        : { career: '', academicCurriculumDoc: null }),
    }));

    // Limpiar errores relacionados con el tipo previo
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated.userType;
      if (type === 'alumno') {
        delete updated.department;
        delete updated.scheduleDoc;
      } else {
        delete updated.career;
        delete updated.academicCurriculumDoc;
      }
      return updated;
    });
  };

  // Validación de contraseña según RNF-06 (mínimo 8 caracteres, letras y números)
  const validatePasswordStrength = (pwd: string) => {
    const hasMinLength = pwd.length >= 8;
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    return {
      isValid: hasMinLength && hasLetter && hasNumber,
      hasMinLength,
      hasLetter,
      hasNumber,
    };
  };

  // Validación integral del formulario
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // 1. Tipo de usuario obligatorio
    if (!formData.userType) {
      newErrors.userType = 'Debes seleccionar obligatoriamente si eres Alumno o Maestro.';
    }

    // 2. Nombre completo
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'El nombre completo es obligatorio.';
    } else if (formData.fullName.trim().length < 4) {
      newErrors.fullName = 'Ingresa tu nombre y apellidos completos.';
    }

    // 3. Correo institucional con dominio @morelia.tecnm.mx (RN-01)
    const emailNormalized = formData.email.trim().toLowerCase();
    if (!emailNormalized) {
      newErrors.email = 'El correo institucional es obligatorio.';
    } else if (!emailNormalized.endsWith(INSTITUTIONAL_DOMAIN)) {
      newErrors.email = `Solo se admiten correos institucionales del dominio ${INSTITUTIONAL_DOMAIN}`;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) {
      newErrors.email = 'El formato del correo institucional no es válido.';
    }

    // 4. Contraseña y confirmación (RNF-06)
    const pwdStrength = validatePasswordStrength(formData.password);
    if (!formData.password) {
      newErrors.password = 'La contraseña es obligatoria.';
    } else if (!pwdStrength.isValid) {
      newErrors.password = 'La contraseña debe tener al menos 8 caracteres y contener letras y números.';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Debes confirmar tu contraseña.';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden.';
    }

    // 5. Validaciones dinámicas por tipo de usuario
    if (formData.userType === 'alumno') {
      if (!formData.career.trim()) {
        newErrors.career = 'Debes seleccionar tu carrera.';
      }
      if (!formData.academicCurriculumDoc) {
        newErrors.academicCurriculumDoc =
          'Es obligatorio adjuntar tu retícula académica vigente para verificar tu estatus de alumno.';
      }
    } else if (formData.userType === 'maestro') {
      if (!formData.department.trim()) {
        newErrors.department = 'Debes seleccionar tu área académica o departamento.';
      }
      if (!formData.scheduleDoc) {
        newErrors.scheduleDoc =
          'Es obligatorio adjuntar tu carga de materias u horario correspondiente al semestre actual.';
      }
    }

    // 6. Aceptación de términos de uso y aviso de privacidad (RF-07)
    if (!formData.termsAccepted) {
      newErrors.termsAccepted =
        'Debes aceptar los términos de uso y el aviso de privacidad para registrarte.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    // Simulación frontend para Sprint 1 (latencia y respuesta local organizada)
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmittedData({ ...formData });
      setShowSuccessModal(true);
    }, 1200);
  };

  const handleResetForm = () => {
    setFormData(initialFormData);
    setErrors({});
    setShowSuccessModal(false);
  };

  const pwdValidation = validatePasswordStrength(formData.password);

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

        <View style={styles.formWrapper}>
          {/* Card principal del formulario */}
          <View style={styles.mainCard}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Registro de Usuario</Text>
              <Text style={styles.formSubtitle}>
                Crea tu cuenta institucional para comenzar a compartir viajes hacia y desde el campus del TecNM.
              </Text>
            </View>

            {/* SELECCIÓN DINÁMICA DE TIPO DE USUARIO */}
            <UserTypeSelector
              selectedType={formData.userType}
              onSelect={handleUserTypeChange}
              error={errors.userType}
            />

            {/* DIVISOR DE SECCIÓN */}
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionDividerText}>Datos de la cuenta</Text>
            </View>

            {/* CAMPOS GENERALES */}
            <InputField
              label="Nombre completo"
              placeholder="Ej. Diego Márquez Domínguez"
              iconName="account-outline"
              value={formData.fullName}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, fullName: text }));
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              error={errors.fullName}
              autoCapitalize="words"
            />

            <InputField
              label="Correo institucional"
              placeholder="ejemplo@morelia.tecnm.mx"
              iconName="email-outline"
              value={formData.email}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, email: text }));
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={errors.email}
              helperText={`Solo se admiten correos con dominio ${INSTITUTIONAL_DOMAIN}`}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <InputField
              label="Contraseña"
              placeholder="Mínimo 8 caracteres (letras y números)"
              iconName="lock-outline"
              value={formData.password}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, password: text }));
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={errors.password}
              isPassword
            />

            {/* Indicador de requisitos de contraseña */}
            {formData.password.length > 0 && (
              <View style={styles.passwordRulesBox}>
                <Text style={styles.passwordRulesTitle}>Requisitos de seguridad:</Text>
                <View style={styles.rulesRow}>
                  <View style={styles.ruleItem}>
                    <MaterialCommunityIcons
                      name={pwdValidation.hasMinLength ? 'check-circle' : 'circle-outline'}
                      size={14}
                      color={pwdValidation.hasMinLength ? THEME.colors.success : THEME.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.ruleText,
                        pwdValidation.hasMinLength && styles.ruleTextValid,
                      ]}
                    >
                      Mínimo 8 caracteres
                    </Text>
                  </View>

                  <View style={styles.ruleItem}>
                    <MaterialCommunityIcons
                      name={pwdValidation.hasLetter ? 'check-circle' : 'circle-outline'}
                      size={14}
                      color={pwdValidation.hasLetter ? THEME.colors.success : THEME.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.ruleText,
                        pwdValidation.hasLetter && styles.ruleTextValid,
                      ]}
                    >
                      Contiene letras
                    </Text>
                  </View>

                  <View style={styles.ruleItem}>
                    <MaterialCommunityIcons
                      name={pwdValidation.hasNumber ? 'check-circle' : 'circle-outline'}
                      size={14}
                      color={pwdValidation.hasNumber ? THEME.colors.success : THEME.colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.ruleText,
                        pwdValidation.hasNumber && styles.ruleTextValid,
                      ]}
                    >
                      Contiene números
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <InputField
              label="Confirmar contraseña"
              placeholder="Vuelve a escribir tu contraseña"
              iconName="lock-check-outline"
              value={formData.confirmPassword}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, confirmPassword: text }));
                if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              error={errors.confirmPassword}
              isPassword
            />

            {/* CAMPOS DINÁMICOS SEGÚN TIPO DE USUARIO */}
            {formData.userType === 'alumno' && (
              <View style={styles.dynamicSection}>
                <View style={styles.dynamicHeader}>
                  <MaterialCommunityIcons name="school" size={20} color={THEME.colors.primary} />
                  <Text style={styles.dynamicTitle}>Requisitos de Alumno</Text>
                </View>

                {/* Carrera */}
                <SelectModalField
                  label="Carrera institucional"
                  value={formData.career}
                  placeholder="Selecciona tu carrera..."
                  options={TECNM_MORELIA_CAREERS}
                  onSelect={(career) => {
                    setFormData((prev) => ({ ...prev, career }));
                    if (errors.career) setErrors((prev) => ({ ...prev, career: undefined }));
                  }}
                  error={errors.career}
                  iconName="school-outline"
                />

                {/* Retícula académica vigente (OBLIGATORIA) */}
                <DocumentPickerField
                  label="Retícula académica vigente"
                  sublabel="Documento oficial expedido por el TecNM Campus Morelia."
                  instructions="Adjunta tu retícula en formato PDF o imagen legible para comprobar tu vigencia escolar en este semestre. Es obligatoria para concluir el registro."
                  file={formData.academicCurriculumDoc}
                  onFileSelect={(file) => {
                    setFormData((prev) => ({ ...prev, academicCurriculumDoc: file }));
                    if (errors.academicCurriculumDoc) {
                      setErrors((prev) => ({ ...prev, academicCurriculumDoc: undefined }));
                    }
                  }}
                  error={errors.academicCurriculumDoc}
                  sampleFileName="reticula_academica_2026.pdf"
                />
              </View>
            )}

            {formData.userType === 'maestro' && (
              <View style={styles.dynamicSection}>
                <View style={styles.dynamicHeader}>
                  <MaterialCommunityIcons name="account-tie" size={20} color={THEME.colors.primary} />
                  <Text style={styles.dynamicTitle}>Requisitos de Maestro</Text>
                </View>

                {/* Área académica o departamento */}
                <SelectModalField
                  label="Área académica o departamento"
                  value={formData.department}
                  placeholder="Selecciona tu departamento..."
                  options={TECNM_MORELIA_DEPARTMENTS}
                  onSelect={(dept) => {
                    setFormData((prev) => ({ ...prev, department: dept }));
                    if (errors.department) setErrors((prev) => ({ ...prev, department: undefined }));
                  }}
                  error={errors.department}
                  iconName="office-building"
                />

                {/* Carga de materias u horario actual (OBLIGATORIO) */}
                <DocumentPickerField
                  label="Carga de materias u horario actual"
                  sublabel="Horario docente del semestre en curso."
                  instructions="Adjunta tu comprobante de carga académica u horario oficial para validar tu adscripción docente activa. Este documento es obligatorio para continuar."
                  file={formData.scheduleDoc}
                  onFileSelect={(file) => {
                    setFormData((prev) => ({ ...prev, scheduleDoc: file }));
                    if (errors.scheduleDoc) {
                      setErrors((prev) => ({ ...prev, scheduleDoc: undefined }));
                    }
                  }}
                  error={errors.scheduleDoc}
                  sampleFileName="carga_horario_docente_2026.pdf"
                />
              </View>
            )}

            {/* AVISO SI NO SE HA SELECCIONADO TIPO */}
            {!formData.userType && (
              <View style={styles.unselectedTypeBox}>
                <MaterialCommunityIcons name="cursor-pointer" size={20} color={THEME.colors.accentDark} />
                <Text style={styles.unselectedTypeText}>
                  Selecciona arriba si eres <Text style={styles.boldText}>Alumno</Text> o <Text style={styles.boldText}>Maestro</Text> para desplegar los campos y requisitos documentales correspondientes.
                </Text>
              </View>
            )}

            {/* TÉRMINOS Y CONDICIONES / AVISO DE PRIVACIDAD */}
            <View style={styles.termsSection}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => {
                  setFormData((prev) => ({ ...prev, termsAccepted: !prev.termsAccepted }));
                  if (errors.termsAccepted) {
                    setErrors((prev) => ({ ...prev, termsAccepted: undefined }));
                  }
                }}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: formData.termsAccepted }}
              >
                <View
                  style={[
                    styles.checkbox,
                    formData.termsAccepted && styles.checkboxChecked,
                    errors.termsAccepted && !formData.termsAccepted && styles.checkboxError,
                  ]}
                >
                  {formData.termsAccepted && (
                    <MaterialCommunityIcons name="check" size={16} color={THEME.colors.textInverse} />
                  )}
                </View>

                <View style={styles.termsTextContainer}>
                  <Text style={styles.termsRegularText}>
                    He leído y acepto los{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => setShowTermsModal(true)}
                    >
                      Términos de Uso
                    </Text>{' '}
                    y el{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => setShowTermsModal(true)}
                    >
                      Aviso de Privacidad
                    </Text>{' '}
                    institucional de EcoRuta Escolar. <Text style={styles.required}>*</Text>
                  </Text>
                </View>
              </TouchableOpacity>

              {errors.termsAccepted ? (
                <View style={styles.termsErrorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={14} color={THEME.colors.error} />
                  <Text style={styles.errorText}>{errors.termsAccepted}</Text>
                </View>
              ) : null}
            </View>

            {/* BOTÓN PRINCIPAL DE REGISTRO */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Completar registro de usuario"
            >
              {isSubmitting ? (
                <View style={styles.submittingContent}>
                  <ActivityIndicator color={THEME.colors.textInverse} size="small" />
                  <Text style={styles.submitButtonText}>Validando y registrando...</Text>
                </View>
              ) : (
                <View style={styles.submitBtnContent}>
                  <MaterialCommunityIcons name="account-plus-outline" size={20} color={THEME.colors.textInverse} />
                  <Text style={styles.submitButtonText}>Crear cuenta en EcoRuta</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.loginHint}>
              <Text style={styles.loginHintText}>¿Ya tienes una cuenta verificada? </Text>
              <TouchableOpacity onPress={onNavigateToLogin} activeOpacity={0.7}>
                <Text style={styles.loginHintLink}>Inicia sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* MODAL DE TÉRMINOS Y CONDICIONES */}
        <TermsModal
          visible={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          onAccept={() => {
            setFormData((prev) => ({ ...prev, termsAccepted: true }));
            if (errors.termsAccepted) {
              setErrors((prev) => ({ ...prev, termsAccepted: undefined }));
            }
          }}
        />

        {/* MODAL DE ÉXITO DE REGISTRO (SPRINT 1) */}
        <SuccessModal
          visible={showSuccessModal}
          data={submittedData}
          onReset={handleResetForm}
          onDismiss={() => {
            setShowSuccessModal(false);
            if (onNavigateToLogin) onNavigateToLogin();
          }}
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
  formWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  mainCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  formHeader: {
    marginBottom: 14,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: -0.3,
  },
  formSubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  sectionDivider: {
    marginTop: 10,
    marginBottom: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  sectionDividerText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  passwordRulesBox: {
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.borderRadius.md,
    padding: 10,
    marginTop: -8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  passwordRulesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 6,
  },
  rulesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ruleText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  ruleTextValid: {
    color: THEME.colors.success,
    fontWeight: '600',
  },
  dynamicSection: {
    backgroundColor: '#FCFDFE',
    borderWidth: 1,
    borderColor: 'rgba(107, 23, 54, 0.15)',
    borderRadius: THEME.borderRadius.lg,
    padding: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  dynamicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(107, 23, 54, 0.1)',
  },
  dynamicTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  unselectedTypeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.warningBg,
    borderRadius: THEME.borderRadius.md,
    padding: 14,
    marginVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.35)',
  },
  unselectedTypeText: {
    fontSize: 13,
    color: '#78350F',
    flex: 1,
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  termsSection: {
    marginVertical: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: THEME.colors.borderSubtle,
    backgroundColor: THEME.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  checkboxError: {
    borderColor: THEME.colors.error,
    backgroundColor: THEME.colors.errorBg,
  },
  termsTextContainer: {
    flex: 1,
  },
  termsRegularText: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    lineHeight: 18,
  },
  termsLink: {
    color: THEME.colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  required: {
    color: THEME.colors.error,
  },
  termsErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingLeft: 32,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.error,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.borderRadius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    ...THEME.shadows.hover,
  },
  submitButtonDisabled: {
    opacity: 0.75,
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submittingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitButtonText: {
    color: THEME.colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  loginHint: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  loginHintText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  loginHintLink: {
    fontSize: 13,
    color: THEME.colors.primary,
    fontWeight: '700',
  },
});
