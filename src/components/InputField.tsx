import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../constants/theme';

interface InputFieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  iconName?: keyof typeof MaterialCommunityIcons.glyphMap;
  error?: string;
  helperText?: string;
  isPassword?: boolean;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  required = true,
  iconName,
  error,
  helperText,
  isPassword = false,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const hasError = Boolean(error);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
      </View>

      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          hasError && styles.inputWrapperError,
        ]}
      >
        {iconName && (
          <View style={styles.leftIconContainer}>
            <MaterialCommunityIcons
              name={iconName}
              size={20}
              color={
                hasError
                  ? THEME.colors.error
                  : isFocused
                  ? THEME.colors.primary
                  : THEME.colors.textMuted
              }
            />
          </View>
        )}

        <TextInput
          style={[styles.input, iconName ? styles.inputWithIcon : undefined]}
          placeholderTextColor={THEME.colors.textMuted}
          secureTextEntry={isPassword && !showPassword}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
          {...props}
        />

        {isPassword && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
          >
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={THEME.colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {hasError ? (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={THEME.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  required: {
    color: THEME.colors.error,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.md,
    height: 50,
    paddingHorizontal: 12,
  },
  inputWrapperFocused: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#FFFFFF',
  },
  inputWrapperError: {
    borderColor: THEME.colors.error,
    backgroundColor: THEME.colors.errorBg,
  },
  leftIconContainer: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: THEME.colors.textPrimary,
  },
  inputWithIcon: {},
  eyeButton: {
    padding: 6,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    paddingHorizontal: 2,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.error,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    paddingHorizontal: 2,
  },
});
